import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  initAuth, 
  googleSignIn, 
  logout 
} from './lib/firebase';
import { User } from 'firebase/auth';
import { TravelBooking, DriveFileItem, Trip, getTripColorClasses } from './types';
import BookingCard from './components/BookingCard';
import Timeline from './components/Timeline';
import TravelChat from './components/TravelChat';
import DriveScanner from './components/DriveScanner';
import { 
  Sparkles, 
  LogOut, 
  FolderSync, 
  Compass, 
  MapPin, 
  Calendar, 
  DollarSign,
  Briefcase,
  Layers,
  FileSpreadsheet,
  AlertCircle,
  Plus,
  Trash2,
  Globe,
  Folder,
  Pencil,
  Check,
  X
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [bookings, setBookings] = useState<TravelBooking[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState<{ [key: string]: boolean }>({});
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeView, setActiveView] = useState<'all-in-one' | 'itinerary' | 'assistant'>('all-in-one');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Trips State
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>('all');
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);

  // New Trip Form State
  const [newTripName, setNewTripName] = useState('');
  const [newTripDestination, setNewTripDestination] = useState('');
  const [newTripColor, setNewTripColor] = useState('indigo');

  // Edit Trip State
  const [editingTripId, setEditingTripId] = useState<string | null>(null);
  const [editingTripName, setEditingTripName] = useState('');
  const [editingTripDestination, setEditingTripDestination] = useState('');
  const [editingTripColor, setEditingTripColor] = useState('indigo');

  const bookingsGridRef = useRef<HTMLDivElement>(null);

  // Initialize Auth and load cache
  useEffect(() => {
    initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setNeedsAuth(true);
      }
    );

    // Load cached trips or seed default trips
    const savedTrips = localStorage.getItem('travel_trips');
    let loadedTrips: Trip[] = [];
    if (savedTrips) {
      try {
        loadedTrips = JSON.parse(savedTrips);
        setTrips(loadedTrips);
      } catch (e) {
        console.error('Failed to parse cached trips:', e);
      }
    } else {
      loadedTrips = [
        {
          id: 'trip-europa-2026',
          name: 'Viaje a Europa',
          destination: 'París y Madrid',
          color: 'indigo'
        },
        {
          id: 'trip-bariloche-2026',
          name: 'Vacaciones de Nieve',
          destination: 'Bariloche, Argentina',
          color: 'sky'
        }
      ];
      setTrips(loadedTrips);
      localStorage.setItem('travel_trips', JSON.stringify(loadedTrips));
    }

    // Load cached bookings
    const savedBookings = localStorage.getItem('travel_bookings');
    if (savedBookings) {
      try {
        const loadedBookings: TravelBooking[] = JSON.parse(savedBookings);
        
        // Migrate bookings to default tripIds if none have any tripId
        const hasAnyTripId = loadedBookings.some(b => b.tripId);
        let migrated = loadedBookings.map(b => {
          const validCats = ['hotel', 'flight', 'car_rental', 'transport', 'activity', 'purchase'];
          return {
            ...b,
            isTravelDocument: b.isTravelDocument || validCats.includes(b.category || '')
          };
        });

        if (!hasAnyTripId && migrated.length > 0 && loadedTrips.length > 0) {
          migrated = migrated.map((b, i) => ({
            ...b,
            // 40% unassigned, 30% Europa, 30% Bariloche
            tripId: i % 3 === 0 ? 'trip-europa-2026' : i % 3 === 1 ? 'trip-bariloche-2026' : undefined
          }));
          setBookings(migrated);
          localStorage.setItem('travel_bookings', JSON.stringify(migrated));
        } else {
          setBookings(migrated);
          localStorage.setItem('travel_bookings', JSON.stringify(migrated));
        }
      } catch (e) {
        console.error('Failed to parse cached bookings:', e);
      }
    }
  }, []);

  // Save trips to cache whenever they change
  useEffect(() => {
    if (trips.length > 0) {
      localStorage.setItem('travel_trips', JSON.stringify(trips));
    }
  }, [trips]);

  // Save bookings to cache whenever they change
  useEffect(() => {
    if (bookings.length > 0) {
      localStorage.setItem('travel_bookings', JSON.stringify(bookings));
    }
  }, [bookings]);

  // Handle Login
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        showToast('¡Sesión iniciada con éxito! Listo para escanear Drive.', 'success');
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      showToast('Error al iniciar sesión con Google.', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      showToast('Sesión cerrada con éxito.', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  // Show status notification
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ message, type });
    const duration = type === 'error' ? 7500 : 4000;
    setTimeout(() => setNotification(null), duration);
  };

  // Analyze a specific Google Drive file
  const handleAnalyzeFile = async (file: DriveFileItem) => {
    if (!accessToken) return;

    setIsAnalyzing(prev => ({ ...prev, [file.id]: true }));
    try {
      const response = await fetch('/api/analyze-doc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          fileId: file.id,
          mimeType: file.mimeType,
          name: file.name,
          source: file.source,
          baseUrl: file.baseUrl
        })
      });

      if (!response.ok) {
        let errMsg = `Error en servidor: ${response.statusText || 'Error desconocido'}`;
        try {
          const errData = await response.json();
          if (errData && errData.details) {
            errMsg = errData.details;
          } else if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (e) {
          // ignore
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      
      const validCategories = ['hotel', 'flight', 'car_rental', 'transport', 'activity', 'purchase'];
      const isDoc = data.isTravelDocument || validCategories.includes(data.category);

      const newBooking: TravelBooking = {
        id: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        iconLink: file.iconLink,
        source: file.source,
        baseUrl: file.baseUrl,
        isTravelDocument: isDoc,
        category: data.category,
        supplier: data.supplier,
        title: data.title,
        startDate: data.startDate,
        startTime: data.startTime,
        endDate: data.endDate,
        endTime: data.endTime,
        confirmationNumber: data.confirmationNumber,
        location: data.location,
        coordinates: data.coordinates,
        passengerOrGuestName: data.passengerOrGuestName,
        price: data.price,
        currency: data.currency,
        details: data.details,
        summary: data.summary,
        tripId: selectedTripId !== 'all' && selectedTripId !== 'unassigned' ? selectedTripId : undefined
      };

      setBookings(prev => {
        // Filter out any previous version of this file
        const filtered = prev.filter(b => b.id !== file.id);
        return [newBooking, ...filtered];
      });

      if (isDoc) {
        showToast(`¡Documento clasificado como ${data.category || 'gasto'}!`, 'success');
      } else {
        showToast('El archivo fue analizado pero no parece ser una reserva o gasto válido.', 'info');
      }

    } catch (err: any) {
      console.error('Error analyzing document:', err);
      showToast(`Error al analizar el archivo: ${err.message}`, 'error');
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [file.id]: false }));
    }
  };

  // Analyze all found files that haven't been processed yet
  const handleAnalyzeAllNew = async (files: DriveFileItem[]) => {
    const unanalyzed = files.filter(f => !bookings.some(b => b.id === f.id));
    if (unanalyzed.length === 0) {
      showToast('Todos los archivos en esta lista ya han sido escaneados.', 'info');
      return;
    }

    showToast(`Analizando ${unanalyzed.length} archivo(s) secuencialmente...`, 'info');
    for (const file of unanalyzed) {
      await handleAnalyzeFile(file);
    }
  };

  // Analyze a local uploaded file (screenshot, PDF, image, text)
  const handleAnalyzeLocalFile = async (name: string, mimeType: string, base64Data: string, localId: string) => {
    setIsAnalyzing(prev => ({ ...prev, [localId]: true }));
    try {
      const response = await fetch('/api/analyze-local', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          mimeType,
          base64Data
        })
      });

      if (!response.ok) {
        let errMsg = `Error en servidor: ${response.statusText || 'Error desconocido'}`;
        try {
          const errData = await response.json();
          if (errData && errData.details) {
            errMsg = errData.details;
          } else if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (e) {
          // ignore
        }
        throw new Error(errMsg);
      }

      const data = await response.json();

      const validCategories = ['hotel', 'flight', 'car_rental', 'transport', 'activity', 'purchase'];
      const isDoc = data.isTravelDocument || validCategories.includes(data.category);

      const newBooking: TravelBooking = {
        id: localId,
        fileName: name,
        mimeType: mimeType,
        isTravelDocument: isDoc,
        category: data.category,
        supplier: data.supplier,
        title: data.title,
        startDate: data.startDate,
        startTime: data.startTime,
        endDate: data.endDate,
        endTime: data.endTime,
        confirmationNumber: data.confirmationNumber,
        location: data.location,
        coordinates: data.coordinates,
        passengerOrGuestName: data.passengerOrGuestName,
        price: data.price,
        currency: data.currency,
        details: data.details,
        summary: data.summary,
        iconLink: '', // Use empty string to signal it is a local file in UI
        tripId: selectedTripId !== 'all' && selectedTripId !== 'unassigned' ? selectedTripId : undefined
      };

      setBookings(prev => {
        const filtered = prev.filter(b => b.id !== localId);
        return [newBooking, ...filtered];
      });

      if (isDoc) {
        showToast(`¡Archivo "${name}" clasificado como ${data.category || 'gasto'}!`, 'success');
      } else {
        showToast(`El archivo "${name}" fue analizado pero no parece ser válido.`, 'info');
      }

    } catch (err: any) {
      console.error('Error analyzing local file:', err);
      showToast(`Error al analizar el archivo local: ${err.message}`, 'error');
      throw err;
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [localId]: false }));
    }
  };

  // Scroll to a specific booking card
  const handleScrollToBooking = (id: string) => {
    const element = document.getElementById(`booking-card-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Temporary highlight
      element.classList.add('ring-2', 'ring-sky-500', 'ring-offset-2');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-sky-500', 'ring-offset-2');
      }, 2000);
    }
  };

  const handleDeleteBooking = (id: string) => {
    setBookings(prev => {
      const updated = prev.filter(b => b.id !== id);
      localStorage.setItem('travel_bookings', JSON.stringify(updated));
      return updated;
    });
    showToast('Registro eliminado', 'info');
  };

  const handleViewDocument = (booking: TravelBooking) => {
    if (booking.id.startsWith('local-')) {
      showToast('No es posible previsualizar documentos locales previamente subidos.', 'error');
    } else {
      window.open(`https://drive.google.com/file/d/${booking.id}/view`, '_blank');
    }
  };

  // Move booking to a specific trip
  const handleMoveToTrip = (bookingId: string, tripId: string) => {
    setBookings(prev => {
      const updated = prev.map(b => {
        if (b.id === bookingId) {
          return {
            ...b,
            tripId: tripId === 'unassigned' ? undefined : tripId
          };
        }
        return b;
      });
      localStorage.setItem('travel_bookings', JSON.stringify(updated));
      return updated;
    });
    showToast('Reserva recategorizada de viaje con éxito.', 'success');
  };

  // Create a new Trip
  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripName.trim()) return;

    const newTrip: Trip = {
      id: `trip-${Date.now()}`,
      name: newTripName.trim(),
      destination: newTripDestination.trim() || undefined,
      color: newTripColor
    };

    setTrips(prev => {
      const updated = [...prev, newTrip];
      localStorage.setItem('travel_trips', JSON.stringify(updated));
      return updated;
    });
    setNewTripName('');
    setNewTripDestination('');
    setNewTripColor('indigo');
    setIsCreatingTrip(false);
    setSelectedTripId(newTrip.id); // Auto select new trip
    showToast(`Viaje "${newTrip.name}" creado correctamente.`, 'success');
  };

  // Delete a Trip
  const handleDeleteTrip = (tripId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the trip
    if (confirm('¿Estás seguro de que quieres eliminar este viaje? Las reservas asociadas no se borrarán, quedarán como "Sin asignar".')) {
      setTrips(prev => {
        const updated = prev.filter(t => t.id !== tripId);
        localStorage.setItem('travel_trips', JSON.stringify(updated));
        return updated;
      });
      setBookings(prev => {
        const updated = prev.map(b => b.tripId === tripId ? { ...b, tripId: undefined } : b);
        localStorage.setItem('travel_bookings', JSON.stringify(updated));
        return updated;
      });
      if (selectedTripId === tripId) {
        setSelectedTripId('all');
      }
      showToast('Viaje eliminado con éxito.', 'info');
    }
  };

  // Save edited Trip
  const handleSaveTrip = (tripId: string) => {
    if (!editingTripName.trim()) {
      showToast('El nombre del viaje no puede estar vacío.', 'error');
      return;
    }

    setTrips(prev => {
      const updated = prev.map(t => {
        if (t.id === tripId) {
          return {
            ...t,
            name: editingTripName.trim(),
            destination: editingTripDestination.trim() || undefined,
            color: editingTripColor
          };
        }
        return t;
      });
      localStorage.setItem('travel_trips', JSON.stringify(updated));
      return updated;
    });

    setEditingTripId(null);
    showToast('Viaje actualizado correctamente.', 'success');
  };

  // Statistics calculation
  const parsedBookings = bookings.filter(b => b.isTravelDocument);
  
  // Filter bookings by selected Trip
  const tripBookings = parsedBookings.filter(b => {
    if (selectedTripId === 'all') return true;
    if (selectedTripId === 'unassigned') return !b.tripId;
    return b.tripId === selectedTripId;
  });

  const totalBookingsCount = tripBookings.length;
  
  // Calculate expenses aggregated by currency for the current trip
  const getExpensesBreakdown = () => {
    const sums: { [currency: string]: number } = {};
    tripBookings.forEach(b => {
      if (b.price && b.currency) {
        const curr = b.currency.toUpperCase();
        sums[curr] = (sums[curr] || 0) + b.price;
      }
    });
    return Object.entries(sums).map(([currency, total]) => `${total.toLocaleString('es-ES')} ${currency}`);
  };

  const expensesDisplay = getExpensesBreakdown();

  // Find next upcoming trip/reservation for the current trip
  const getNextBooking = () => {
    const now = new Date();
    const upcoming = tripBookings
      .filter(b => b.startDate)
      .map(b => {
        const d = new Date(b.startDate!);
        return { booking: b, diff: d.getTime() - now.getTime() };
      })
      .filter(x => x.diff > 0)
      .sort((a, b) => a.diff - b.diff);

    return upcoming.length > 0 ? upcoming[0].booking : null;
  };

  const nextBooking = getNextBooking();

  // Filter bookings for display (by both Trip and Category)
  const filteredBookings = tripBookings.filter(b => {
    if (activeCategory === 'all') return true;
    return b.category === activeCategory;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative overflow-x-hidden" id="app-root-container">
      {/* Dynamic Toast Message */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-3 text-xs font-medium max-w-[90vw] md:max-w-xl ${
              notification.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              notification.type === 'error' ? 'bg-rose-50 border-rose-100 text-rose-800' :
              'bg-sky-50 border-sky-100 text-sky-800'
            }`}
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
            <div className="flex-1 leading-relaxed">{notification.message}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOGIN VIEW */}
      {needsAuth ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-900 text-white relative">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]" />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full text-center relative z-10"
          >
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/10">
              <Compass className="w-9 h-9 text-white" />
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 font-sans">
              Gestor de Documentos de Viaje
            </h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
              Gestioná tus vuelos, hoteles, alquileres de auto y actividades desde tu Google Drive con inteligencia artificial.
            </p>

            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center py-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold rounded-xl transition-all shadow-lg active:scale-[0.99] cursor-pointer gap-3"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block', width: '20px', height: '20px' }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span className="text-sm">
                {isLoggingIn ? 'Conectando...' : 'Iniciar Sesión con Google'}
              </span>
            </button>

            <p className="text-[11px] text-slate-500 mt-6 max-w-xs mx-auto">
              Para analizar tus documentos, requerimos permisos de lectura de Google Drive de forma privada y segura.
            </p>
          </motion.div>
        </div>
      ) : (
        /* MAIN DASHBOARD VIEW */
        <>
          {/* SIDEBAR NAVIGATION - DESKTOP ONLY */}
          <aside className="w-72 bg-white border-r border-slate-200 hidden md:flex flex-col h-screen sticky top-0 shrink-0 select-none z-30" id="sidebar-navigation">
            {/* BRAND HEADER */}
            <div className="h-20 border-b border-slate-200 px-6 flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm shadow-indigo-600/15">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-semibold text-slate-900 tracking-tight text-sm leading-snug">Gestor de Viajes</h1>
                <p className="text-[10px] text-slate-400">Inteligencia Artificial</p>
              </div>
            </div>

            {/* CATEGORIES NAVIGATION */}
            <div className="p-6 flex flex-col gap-1.5 overflow-y-auto flex-1">
              {/* SECTION: MIS VIAJES */}
              <div className="mb-6 flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mis Viajes</p>
                  <button
                    onClick={() => setIsCreatingTrip(!isCreatingTrip)}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 uppercase flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Nuevo
                  </button>
                </div>

                {/* TRIP CREATION INLINE FORM */}
                <AnimatePresence>
                  {isCreatingTrip && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleCreateTrip}
                      className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col gap-3 mb-2 overflow-hidden"
                    >
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nombre del viaje</label>
                        <input
                          type="text"
                          required
                          value={newTripName}
                          onChange={(e) => setNewTripName(e.target.value)}
                          placeholder="Ej: Vacaciones 2026"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none focus:border-indigo-300 font-semibold"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Destino (Opcional)</label>
                        <input
                          type="text"
                          value={newTripDestination}
                          onChange={(e) => setNewTripDestination(e.target.value)}
                          placeholder="Ej: Madrid, París"
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 outline-none focus:border-indigo-300 font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Color de etiqueta</label>
                        <div className="flex items-center gap-2 mt-1">
                          {['indigo', 'emerald', 'sky', 'rose', 'amber', 'purple'].map((color) => {
                            const cClasses = getTripColorClasses(color);
                            return (
                              <button
                                key={color}
                                type="button"
                                onClick={() => setNewTripColor(color)}
                                className={`w-5 h-5 rounded-full ${cClasses.dot} border-2 ${
                                  newTripColor === color ? 'border-slate-800 scale-110 shadow-sm' : 'border-white hover:scale-105'
                                } transition-all cursor-pointer`}
                                title={color}
                              />
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-1">
                        <button
                          type="submit"
                          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase py-1.5 rounded-lg shadow-sm cursor-pointer transition-all"
                        >
                          Crear
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingTrip(false);
                            setNewTripName('');
                            setNewTripDestination('');
                          }}
                          className="flex-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-bold uppercase py-1.5 rounded-lg cursor-pointer transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                {/* TRIPS LIST */}
                <div className="space-y-1">
                  {/* All trips trigger */}
                  <button
                    onClick={() => {
                      setSelectedTripId('all');
                      setActiveCategory('all');
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all text-left cursor-pointer ${
                      selectedTripId === 'all'
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Globe className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate">Todos los viajes</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono font-bold group-hover:bg-slate-200">
                      {parsedBookings.length}
                    </span>
                  </button>

                  {/* Individual custom trips */}
                  {trips.map((trip) => {
                    const cClasses = getTripColorClasses(trip.color);
                    const tripCount = parsedBookings.filter(b => b.tripId === trip.id).length;
                    const isEditing = editingTripId === trip.id;
                    
                    if (isEditing) {
                      return (
                        <div
                          key={trip.id}
                          className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Nombre</label>
                            <input
                              type="text"
                              value={editingTripName}
                              onChange={(e) => setEditingTripName(e.target.value)}
                              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-1.5 text-slate-800 outline-none focus:border-indigo-300 font-semibold"
                              placeholder="Nombre del viaje"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Destino (Opcional)</label>
                            <input
                              type="text"
                              value={editingTripDestination}
                              onChange={(e) => setEditingTripDestination(e.target.value)}
                              className="w-full text-[10px] bg-white border border-slate-200 rounded-lg p-1.5 text-slate-800 outline-none focus:border-indigo-300 font-medium"
                              placeholder="Destino"
                            />
                          </div>
                          
                          {/* Color selector inline */}
                          <div className="flex items-center justify-between gap-1 mt-1 border-t border-slate-100 pt-2">
                            <div className="flex items-center gap-1">
                              {['indigo', 'emerald', 'sky', 'rose', 'amber', 'purple'].map((color) => {
                                const colClasses = getTripColorClasses(color);
                                return (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => setEditingTripColor(color)}
                                    className={`w-4 h-4 rounded-full ${colClasses.dot} border ${
                                      editingTripColor === color ? 'border-slate-800 scale-110 shadow-xs' : 'border-white hover:scale-105'
                                    } transition-all cursor-pointer`}
                                    title={color}
                                  />
                                );
                              })}
                            </div>
                            
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleSaveTrip(trip.id)}
                                className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-100 cursor-pointer transition-colors"
                                title="Guardar"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingTripId(null)}
                                className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-200 cursor-pointer transition-colors"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={trip.id}
                        onClick={() => {
                          setSelectedTripId(trip.id);
                          setActiveCategory('all'); // Reset active category to see entire trip overview
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all text-left cursor-pointer group ${
                          selectedTripId === trip.id
                            ? `${cClasses.bg} ${cClasses.text} border border-indigo-100/30 font-bold`
                            : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedTripId(trip.id);
                            setActiveCategory('all');
                          }
                        }}
                      >
                        <div className={`w-2.5 h-2.5 rounded-full ${cClasses.dot} shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold">{trip.name}</p>
                          {trip.destination && (
                            <p className="text-[9px] text-slate-400 truncate -mt-0.5 font-medium">{trip.destination}</p>
                          )}
                        </div>
                        
                        {/* Trip count and delete button */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                            selectedTripId === trip.id ? 'bg-white/80' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                          }`}>
                            {tripCount}
                          </span>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTripId(trip.id);
                              setEditingTripName(trip.name);
                              setEditingTripDestination(trip.destination || '');
                              setEditingTripColor(trip.color);
                            }}
                            className="p-1 rounded-lg hover:bg-slate-200/50 text-slate-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Editar viaje"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => handleDeleteTrip(trip.id, e)}
                            className="p-1 rounded-lg hover:bg-slate-200/50 text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Eliminar viaje"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Unassigned trigger */}
                  <button
                    onClick={() => {
                      setSelectedTripId('unassigned');
                      setActiveCategory('all');
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-tight transition-all text-left cursor-pointer ${
                      selectedTripId === 'unassigned'
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Folder className="w-4 h-4 shrink-0 text-slate-400" />
                    <span className="flex-1 truncate">Sin asignar</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-mono font-bold">
                      {parsedBookings.filter(b => !b.tripId).length}
                    </span>
                  </button>
                </div>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 border-t border-slate-100 pt-4">Categorías</p>
              {[
                { id: 'all', label: 'Todos', emoji: '📄' },
                { id: 'hotel', label: 'Hoteles', emoji: '🏨' },
                { id: 'flight', label: 'Vuelos', emoji: '✈️' },
                { id: 'car_rental', label: 'Alquiler de Autos', emoji: '🚗' },
                { id: 'activity', label: 'Actividades', emoji: '🎫' },
                { id: 'purchase', label: 'Compras y Recibos', emoji: '🛍️' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setTimeout(() => {
                      bookingsGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-semibold tracking-tight transition-all text-left cursor-pointer ${
                    activeCategory === cat.id
                      ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100/30'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <span className="text-sm shrink-0">{cat.emoji}</span>
                  <span className="flex-1 truncate">{cat.label}</span>
                </button>
              ))}

              <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Herramientas</p>
                <button
                  onClick={() => setActiveView('all-in-one')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition-all cursor-pointer ${
                    activeView === 'all-in-one'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FolderSync className="w-4 h-4 shrink-0" />
                  <span>Escáner de Drive</span>
                </button>
                <button
                  onClick={() => setActiveView('assistant')}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition-all cursor-pointer ${
                    activeView === 'assistant'
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Asistente de Viaje</span>
                </button>
              </div>
            </div>

            {/* DYNAMIC METRIC INFO BOX / FOOTER IN SIDEBAR */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 m-5">
              <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                Sincronizado con Google Drive • Total: {parsedBookings.filter(b => b.category === 'hotel').length} Hoteles • {parsedBookings.filter(b => b.category === 'flight').length} Vuelos • {parsedBookings.filter(b => b.category === 'car_rental').length} Autos • {parsedBookings.filter(b => b.category === 'purchase').length} Compras
              </p>
            </div>
          </aside>

          {/* MAIN PAGE WRAPPER */}
          <div className="flex-1 flex flex-col min-w-0" id="main-page-wrapper">
            
            {/* TOP HEADER */}
            <header className="h-20 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40 select-none shrink-0">
              <div className="flex items-center gap-3">
                {/* Mobile menu trigger / logo block */}
                <div className="md:hidden p-2 bg-indigo-600 rounded-lg text-white">
                  <Compass className="w-4 h-4" />
                </div>
                <div className="md:block hidden">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">Documentos de Viaje</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Mostrando información inteligente para tus itinerarios</p>
                </div>
                <div className="md:hidden block">
                  <h1 className="font-bold text-slate-900 text-sm tracking-tight">Gestor de Viajes</h1>
                </div>
              </div>

              {/* Action buttons and profile info */}
              <div className="flex items-center gap-4">
                {user && (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-2 bg-slate-50 pl-2 pr-3 py-1.5 rounded-full border border-slate-200">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center font-bold text-[10px] text-slate-600">
                          {user.displayName?.charAt(0) || user.email?.charAt(0)}
                        </div>
                      )}
                      <span className="text-xs font-semibold text-slate-700 hidden sm:inline max-w-[120px] truncate">
                        {user.displayName || user.email}
                      </span>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                      title="Cerrar Sesión"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 p-4 sm:p-8 space-y-8 overflow-y-auto">
              
              {/* MOBILE TRIPS SCROLLER */}
              <div className="md:hidden flex flex-col gap-1.5 pb-2 border-b border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Mis Viajes</span>
                <div className="flex overflow-x-auto gap-2 -mx-4 px-4 scrollbar-none py-1">
                  {/* All trips mobile trigger */}
                  <button
                    onClick={() => {
                      setSelectedTripId('all');
                      setActiveCategory('all');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-tight whitespace-nowrap transition-all border shrink-0 ${
                      selectedTripId === 'all'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Todos</span>
                  </button>

                  {/* Individual custom trips on mobile */}
                  {trips.map((trip) => {
                    const cClasses = getTripColorClasses(trip.color);
                    return (
                      <button
                        key={trip.id}
                        onClick={() => {
                          setSelectedTripId(trip.id);
                          setActiveCategory('all');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-tight whitespace-nowrap transition-all border shrink-0 ${
                          selectedTripId === trip.id
                            ? `${cClasses.bg} ${cClasses.text} border-indigo-200`
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${cClasses.dot}`} />
                        <span>{trip.name}</span>
                      </button>
                    );
                  })}

                  {/* Unassigned mobile trigger */}
                  <button
                    onClick={() => {
                      setSelectedTripId('unassigned');
                      setActiveCategory('all');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold tracking-tight whitespace-nowrap transition-all border shrink-0 ${
                      selectedTripId === 'unassigned'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>Sin asignar</span>
                  </button>
                </div>
              </div>

              {/* MOBILE CATEGORIES ROW */}
              <div className="md:hidden flex overflow-x-auto gap-1.5 pb-2 -mx-4 px-4 scrollbar-none" id="mobile-categories-navigation">
                {[
                  { id: 'all', label: 'Todos', emoji: '📄' },
                  { id: 'hotel', label: 'Hoteles', emoji: '🏨' },
                  { id: 'flight', label: 'Vuelos', emoji: '✈️' },
                  { id: 'car_rental', label: 'Autos', emoji: '🚗' },
                  { id: 'activity', label: 'Actividades', emoji: '🎫' },
                  { id: 'purchase', label: 'Compras', emoji: '🛍️' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setActiveCategory(cat.id);
                      showToast(`Filtrando por ${cat.label}`, 'info');
                      setTimeout(() => {
                        bookingsGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border shrink-0 ${
                      activeCategory === cat.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* MOBILE VIEW SWITCHER */}
              <div className="md:hidden bg-white border border-slate-200 p-1 rounded-xl flex shadow-sm" id="mobile-view-switcher">
                <button
                  onClick={() => setActiveView('all-in-one')}
                  className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeView === 'all-in-one' 
                      ? 'bg-slate-950 text-white' 
                      : 'text-slate-600'
                  }`}
                >
                  Escáner de Drive
                </button>
                <button
                  onClick={() => setActiveView('assistant')}
                  className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeView === 'assistant' 
                      ? 'bg-slate-950 text-white' 
                      : 'text-slate-600'
                  }`}
                >
                  Asistente de Viaje
                </button>
              </div>

              {/* CURRENT TRIP BANNER/TITLE */}
              {(() => {
                const currentTrip = trips.find(t => t.id === selectedTripId);
                return (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm" id="current-trip-banner">
                    <div className="flex items-center gap-3.5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 border shadow-sm ${
                        selectedTripId === 'all' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' :
                        selectedTripId === 'unassigned' ? 'bg-slate-50 border-slate-100 text-slate-500' :
                        getTripColorClasses(currentTrip?.color || 'indigo').bg + ' ' + getTripColorClasses(currentTrip?.color || 'indigo').text + ' border-indigo-100'
                      }`}>
                        {selectedTripId === 'all' ? '🌍' : selectedTripId === 'unassigned' ? '📁' : '✈️'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900 tracking-tight">
                            {selectedTripId === 'all' ? 'Todos los viajes' :
                             selectedTripId === 'unassigned' ? 'Reservas sin asignar' :
                             currentTrip?.name}
                          </h3>
                          {currentTrip && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getTripColorClasses(currentTrip.color).badge}`}>
                              Viaje Activo
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {selectedTripId === 'all' ? 'Explorando todos tus itinerarios de viaje unificados.' :
                           selectedTripId === 'unassigned' ? 'Estas reservas no pertenecen a ningún viaje específico. Arrastralas a un viaje en la tarjeta para organizarlas.' :
                           currentTrip?.destination ? `Destino: ${currentTrip.destination}` : 'Sin destino definido.'}
                        </p>
                      </div>
                    </div>
                    {/* If selectedTripId is an actual trip, let them know newly uploaded items will be assigned here! */}
                    {selectedTripId !== 'all' && selectedTripId !== 'unassigned' && (
                      <div className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-3.5 py-2 rounded-xl border border-emerald-100 flex items-center gap-2 max-w-sm sm:self-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span>Nuevos escaneos se añadirán automáticamente a este viaje.</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* STATS OVERVIEW CARDS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" id="stats-overview-grid">
                {/* Stat 1 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-xl shrink-0 font-bold border border-indigo-100">
                    📄
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Documentos</span>
                    <p className="text-xl font-bold text-slate-900 mt-0.5">{totalBookingsCount}</p>
                  </div>
                </div>

                {/* Stat 2 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl shrink-0 font-bold border border-emerald-100">
                    💰
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Inversión Detectada</span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5 truncate">
                      {expensesDisplay.length > 0 ? expensesDisplay.join(' | ') : 'Sin gastos'}
                    </p>
                  </div>
                </div>

                {/* Stat 3 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm sm:col-span-2 lg:col-span-1">
                  <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center text-xl shrink-0 font-bold border border-orange-100">
                    📅
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Próxima Reserva</span>
                    <p className="text-xs font-semibold text-slate-900 mt-0.5 truncate">
                      {nextBooking ? `${nextBooking.supplier || nextBooking.title} (${nextBooking.startDate})` : 'Ninguna registrada'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SPLIT LAYOUT: LEFT SIDE SCANNER/CHAT, RIGHT SIDE TIMELINE & CARDS */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start" id="split-layout">
                
                {/* LEFT COLUMN: Drive Scanner & Itinerary Assistant Chat */}
                <div className="xl:col-span-5 space-y-6">
                  {/* View Selector inside desktop main area */}
                  <div className="bg-white border border-slate-200 p-1 rounded-xl hidden md:flex shadow-sm" id="desktop-view-switcher">
                    <button
                      onClick={() => setActiveView('all-in-one')}
                      className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        activeView === 'all-in-one' 
                          ? 'bg-slate-950 text-white' 
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      Búsqueda y Escáner de Drive
                    </button>
                    <button
                      onClick={() => setActiveView('assistant')}
                      className={`flex-1 text-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        activeView === 'assistant' 
                          ? 'bg-slate-950 text-white' 
                          : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      Asistente de Viaje
                    </button>
                  </div>

                  {/* Render Scanner or Chat dynamically */}
                  <div className="transition-all duration-300">
                    {activeView === 'all-in-one' ? (
                      <DriveScanner
                        accessToken={accessToken || ''}
                        bookings={bookings}
                        isAnalyzing={isAnalyzing}
                        onAnalyzeFile={handleAnalyzeFile}
                        onAnalyzeLocalFile={handleAnalyzeLocalFile}
                        onScanComplete={(files) => {
                          const unanalyzedCount = files.filter(f => !bookings.some(b => b.id === f.id)).length;
                          if (unanalyzedCount > 0) {
                            showToast(`Encontramos ${unanalyzedCount} nuevos archivos posibles de reservas. ¡Analízalos con IA!`, 'info');
                          }
                        }}
                      />
                    ) : (
                      <TravelChat bookings={bookings} trips={trips} />
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN: Itinerary Timeline & Scanned Cards */}
                <div className="xl:col-span-7 space-y-8">
                  
                  {/* Timeline Panel */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm tracking-tight flex items-center gap-2">
                          🗺️ Itinerario Cronológico
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Ordenado automáticamente por fecha de partida o estadía</p>
                      </div>
                    </div>

                    <Timeline 
                      bookings={tripBookings} 
                      onSelectBooking={handleScrollToBooking} 
                      trips={trips}
                      showTripBadge={selectedTripId === 'all'}
                    />
                  </div>

                  {/* Scanned Cards Panel with Title and List Grid */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm tracking-tight">Documentos Escaneados</h3>
                        <p className="text-[11px] text-slate-400">Detalles procesados y confirmaciones registradas</p>
                      </div>
                      
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full uppercase border border-indigo-100">
                        {activeCategory === 'all' ? 'Todo' : activeCategory}
                      </span>
                    </div>

                    {/* Booking Grid */}
                    <div 
                      ref={bookingsGridRef}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-5"
                    >
                      {filteredBookings.length === 0 ? (
                        <div className="sm:col-span-2 bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                          No hay reservas registradas en esta categoría. Usa el panel de escaneo de Google Drive para agregar y analizar tus archivos.
                        </div>
                      ) : (
                        filteredBookings.map((b) => (
                          <BookingCard
                            key={b.id}
                            booking={b}
                            isAnalyzing={isAnalyzing[b.id] || false}
                            trips={trips}
                            onMoveToTrip={handleMoveToTrip}
                            onDelete={handleDeleteBooking}
                            onViewDocument={handleViewDocument}
                            onReanalyze={(id) => {
                              const driveFile = {
                                id: b.id,
                                name: b.fileName,
                                mimeType: b.mimeType,
                                webViewLink: b.webViewLink,
                                iconLink: b.iconLink,
                                source: b.source,
                                baseUrl: b.baseUrl
                              };
                              handleAnalyzeFile(driveFile);
                            }}
                          />
                        ))
                      )}
                    </div>
                  </div>

                </div>

              </div>

            </main>

            {/* BOTTOM BANNER (Matching the exact design theme uppercase banner style) */}
            <footer className="h-12 bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold uppercase tracking-widest select-none shrink-0" id="bottom-banner">
              Total: {parsedBookings.filter(b => b.category === 'hotel').length} Hoteles • {parsedBookings.filter(b => b.category === 'flight').length} Vuelos • {parsedBookings.filter(b => b.category === 'car_rental').length} Coches • {parsedBookings.filter(b => b.category === 'activity').length} Actividades • {parsedBookings.filter(b => b.category === 'purchase').length} Compras
            </footer>

          </div>
        </>
      )}
    </div>
  );
}
