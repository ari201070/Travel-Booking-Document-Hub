import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TravelBooking, Trip, getTripColorClasses, BookingCategory } from '../types';
import { 
  MapPin, 
  Navigation, 
  Globe, 
  Calendar, 
  ExternalLink, 
  Plus, 
  Edit3, 
  Check, 
  X, 
  Filter,
  Sparkles,
  Layers,
  Search
} from 'lucide-react';

interface MapViewProps {
  bookings: TravelBooking[];
  trips: Trip[];
  selectedTripId: string;
  onSelectBooking?: (booking: TravelBooking) => void;
  onUpdateCoordinates?: (bookingId: string, coords: { lat: number; lng: number }, locationName?: string) => void;
}

// Fallback coordinates for common destinations if coordinates are not explicitly set
const CITY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'bariloche': { lat: -41.1335, lng: -71.3103 },
  'san carlos de bariloche': { lat: -41.1335, lng: -71.3103 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'parís': { lat: 48.8566, lng: 2.3522 },
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
  'roma': { lat: 41.9028, lng: 12.4964 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'londres': { lat: 51.5074, lng: -0.1278 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'nueva york': { lat: 40.7128, lng: -74.0060 },
  'new york': { lat: 40.7128, lng: -74.0060 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'cancún': { lat: 21.1619, lng: -86.8515 },
  'cancun': { lat: 21.1619, lng: -86.8515 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'tokio': { lat: 35.6762, lng: 139.6503 },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729 },
  'santiago': { lat: -33.4489, lng: -70.6693 }
};

function getCategoryMeta(category?: BookingCategory) {
  switch (category) {
    case 'hotel':
      return { emoji: '🏨', label: 'Hotel', color: '#6366f1', bgClass: 'bg-indigo-600', borderClass: 'border-indigo-600' };
    case 'flight':
      return { emoji: '✈️', label: 'Vuelo', color: '#0284c7', bgClass: 'bg-sky-600', borderClass: 'border-sky-600' };
    case 'car_rental':
      return { emoji: '🚗', label: 'Alquiler de Auto', color: '#059669', bgClass: 'bg-emerald-600', borderClass: 'border-emerald-600' };
    case 'activity':
      return { emoji: '🎫', label: 'Actividad', color: '#e11d48', bgClass: 'bg-rose-600', borderClass: 'border-rose-600' };
    case 'purchase':
      return { emoji: '🛍️', label: 'Compra / Recibo', color: '#d97706', bgClass: 'bg-amber-600', borderClass: 'border-amber-600' };
    default:
      return { emoji: '📍', label: 'Punto de Interés', color: '#475569', bgClass: 'bg-slate-700', borderClass: 'border-slate-700' };
  }
}

export default function MapView({
  bookings,
  trips,
  selectedTripId,
  onSelectBooking,
  onUpdateCoordinates
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const polylineRef = useRef<L.Polyline | null>(null);

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [manualLat, setManualLat] = useState<string>('');
  const [manualLng, setManualLng] = useState<string>('');
  const [manualLocationName, setManualLocationName] = useState<string>('');

  // Process bookings to resolve coordinates
  const mappedBookings = useMemo(() => {
    return bookings.map((booking) => {
      let coords = booking.coordinates;

      // Try city fallback lookup if missing explicit coordinates
      if (!coords && booking.location) {
        const locLower = booking.location.toLowerCase();
        for (const [city, cityCoords] of Object.entries(CITY_COORDINATES)) {
          if (locLower.includes(city)) {
            coords = cityCoords;
            break;
          }
        }
      }

      // Check trip fallback if destination matches
      if (!coords && booking.tripId) {
        const trip = trips.find((t) => t.id === booking.tripId);
        if (trip?.destination) {
          const destLower = trip.destination.toLowerCase();
          for (const [city, cityCoords] of Object.entries(CITY_COORDINATES)) {
            if (destLower.includes(city)) {
              coords = cityCoords;
              break;
            }
          }
        }
      }

      return {
        ...booking,
        resolvedCoords: coords || null
      };
    });
  }, [bookings, trips]);

  // Filter bookings with resolved coordinates
  const validPOIs = useMemo(() => {
    return mappedBookings.filter((b) => {
      if (!b.resolvedCoords) return false;
      if (activeCategoryFilter !== 'all' && b.category !== activeCategoryFilter) return false;
      return true;
    });
  }, [mappedBookings, activeCategoryFilter]);

  // Unmapped bookings (missing coordinates)
  const unmappedBookings = useMemo(() => {
    return mappedBookings.filter((b) => !b.resolvedCoords);
  }, [mappedBookings]);

  // Current active trip context
  const currentTrip = useMemo(() => {
    return trips.find((t) => t.id === selectedTripId);
  }, [trips, selectedTripId]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Create map
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([20, 0], 2);

      // Add OpenStreetMap Tile Layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
      }).addTo(map);

      // Add custom zoom control in top right
      L.control.zoom({ position: 'topright' }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers & Polylines whenever validPOIs changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker: L.Marker) => marker.remove());
    markersRef.current = {};

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (validPOIs.length === 0) {
      map.setView([20, 0], 2);
      return;
    }

    const bounds = L.latLngBounds([]);
    const routePoints: [number, number][] = [];

    // Sort valid POIs by date for route connection
    const sortedPOIs = [...validPOIs].sort((a, b) => {
      const dateA = a.startDate || '9999-12-31';
      const dateB = b.startDate || '9999-12-31';
      return dateA.localeCompare(dateB);
    });

    sortedPOIs.forEach((b) => {
      if (!b.resolvedCoords) return;

      const { lat, lng } = b.resolvedCoords;
      const meta = getCategoryMeta(b.category);
      const latLng: [number, number] = [lat, lng];

      bounds.extend(latLng);
      routePoints.push(latLng);

      // Create custom DivIcon
      const isSelected = selectedBookingId === b.id;
      const customIcon = L.divIcon({
        className: 'custom-map-marker-container',
        html: `
          <div class="group relative flex items-center justify-center cursor-pointer transform transition-transform duration-200 ${isSelected ? 'scale-125 z-50' : 'hover:scale-110 z-10'}">
            <div class="w-10 h-10 rounded-full ${meta.bgClass} text-white flex items-center justify-center shadow-lg border-2 border-white text-base">
              ${meta.emoji}
            </div>
            ${isSelected ? '<div class="absolute -inset-1 rounded-full bg-indigo-500/30 animate-ping -z-10"></div>' : ''}
            <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-slate-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md backdrop-blur-xs max-w-[120px] truncate pointer-events-none">
              ${b.supplier || b.title || b.fileName}
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      // Create popup content
      const popupContent = document.createElement('div');
      popupContent.className = 'p-3 font-sans max-w-xs';
      popupContent.innerHTML = `
        <div class="flex items-center gap-2 mb-1.5">
          <span class="text-xs px-2 py-0.5 rounded-full font-bold text-white ${meta.bgClass}">
            ${meta.emoji} ${meta.label}
          </span>
          ${b.startDate ? `<span class="text-[10px] font-semibold text-slate-500">${b.startDate}</span>` : ''}
        </div>
        <h4 class="font-bold text-slate-900 text-sm leading-tight mb-1">
          ${b.title || b.supplier || b.fileName}
        </h4>
        ${b.supplier ? `<p class="text-xs font-semibold text-indigo-600 mb-1">${b.supplier}</p>` : ''}
        ${b.location ? `<p class="text-xs text-slate-600 mb-2 font-medium flex items-center gap-1"><span class="text-slate-400">📍</span> ${b.location}</p>` : ''}
        ${b.price ? `<p class="text-xs font-bold text-slate-900 mb-2">${b.currency || '$'} ${b.price.toLocaleString()}</p>` : ''}
        <div class="text-[10px] text-slate-400 font-mono bg-slate-50 p-1 rounded border border-slate-200">
          Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on('click', () => {
        setSelectedBookingId(b.id);
        if (onSelectBooking) onSelectBooking(b);
      });

      markersRef.current[b.id] = marker;
    });

    // Draw route polylines if we have at least 2 POIs
    if (routePoints.length >= 2) {
      polylineRef.current = L.polyline(routePoints, {
        color: '#6366f1',
        weight: 3,
        opacity: 0.7,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(map);
    }

    // Fit map to bounds with padding
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [validPOIs, selectedBookingId]);

  // Fly to a specific POI when clicked from list
  const handleFocusPOI = (b: (typeof mappedBookings)[0]) => {
    setSelectedBookingId(b.id);
    if (b.resolvedCoords && mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([b.resolvedCoords.lat, b.resolvedCoords.lng], 15, {
        duration: 1.2
      });
      const marker = markersRef.current[b.id];
      if (marker) {
        marker.openPopup();
      }
    }
  };

  // Save manual coordinates edit
  const handleSaveCoordinates = (bookingId: string) => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (isNaN(lat) || isNaN(lng)) {
      alert('Por favor introduce valores de latitud y longitud válidos.');
      return;
    }

    if (onUpdateCoordinates) {
      onUpdateCoordinates(bookingId, { lat, lng }, manualLocationName || undefined);
    }

    setEditingBookingId(null);
    setManualLat('');
    setManualLng('');
    setManualLocationName('');
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm tracking-tight">
                Mapa del Viaje {currentTrip ? `• ${currentTrip.name}` : ''}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Visualización interactiva de todos los puntos de interés, alojamientos, vuelos y tickets
              </p>
            </div>
          </div>
        </div>

        {/* POI COUNTER BADGE */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl font-bold border border-indigo-100/60 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span>{validPOIs.length} / {bookings.length} Puntos Geolocalizados</span>
          </span>
        </div>
      </div>

      {/* CATEGORY FILTER STRIP */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1">
          <Filter className="w-3 h-3" /> Filtrar:
        </span>

        {[
          { id: 'all', label: 'Todos', emoji: '🗺️' },
          { id: 'hotel', label: 'Hoteles', emoji: '🏨' },
          { id: 'flight', label: 'Vuelos', emoji: '✈️' },
          { id: 'car_rental', label: 'Autos', emoji: '🚗' },
          { id: 'activity', label: 'Actividades', emoji: '🎫' },
          { id: 'purchase', label: 'Compras', emoji: '🛍️' },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryFilter(cat.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
              activeCategoryFilter === cat.id
                ? 'bg-slate-900 text-white border-slate-900 font-bold shadow-xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <span>{cat.emoji}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* MAIN MAP CONTAINER & SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* MAP CANVAS (8 COLS) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-2 shadow-sm overflow-hidden relative">
          <div
            ref={mapContainerRef}
            className="w-full h-[540px] rounded-xl overflow-hidden border border-slate-100 relative z-0"
          />

          {/* Map Overlay Badge */}
          <div className="absolute top-5 left-5 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2 text-xs font-semibold text-slate-800">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
            <span>Map Data © OpenStreetMap</span>
          </div>
        </div>

        {/* POI LIST / DETAILS SIDEBAR (4 COLS) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-600" /> Puntos de Interés ({validPOIs.length})
              </h4>
            </div>

            {validPOIs.length === 0 ? (
              <div className="text-center py-8 px-4 text-slate-400 space-y-2">
                <MapPin className="w-8 h-8 mx-auto text-slate-300 stroke-1" />
                <p className="text-xs font-medium">No se encontraron puntos en esta categoría para el mapa.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                {validPOIs.map((b) => {
                  const meta = getCategoryMeta(b.category);
                  const isSelected = selectedBookingId === b.id;

                  return (
                    <div
                      key={b.id}
                      onClick={() => handleFocusPOI(b)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-200 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{meta.emoji}</span>
                          <div>
                            <h5 className="font-bold text-slate-900 text-xs leading-tight">
                              {b.title || b.supplier || b.fileName}
                            </h5>
                            {b.supplier && (
                              <p className="text-[10px] font-semibold text-indigo-600">{b.supplier}</p>
                            )}
                          </div>
                        </div>

                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white shrink-0 ${meta.bgClass}`}>
                          {meta.label}
                        </span>
                      </div>

                      {b.location && (
                        <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1 font-medium truncate">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{b.location}</span>
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/80 text-[10px] text-slate-400 font-mono">
                        <span>
                          {b.resolvedCoords?.lat.toFixed(4)}, {b.resolvedCoords?.lng.toFixed(4)}
                        </span>
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBookingId(b.id);
                            setManualLat(b.resolvedCoords?.lat.toString() || '');
                            setManualLng(b.resolvedCoords?.lng.toString() || '');
                            setManualLocationName(b.location || '');
                          }}
                          className="text-indigo-600 hover:underline flex items-center gap-0.5 font-sans font-bold cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" /> Editar
                        </button>
                      </div>

                      {/* EDIT COORDINATES INLINE MODAL/FORM */}
                      {editingBookingId === b.id && (
                        <div
                          className="mt-3 p-3 bg-white border border-indigo-200 rounded-xl space-y-2 shadow-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-[10px] font-bold text-indigo-700 uppercase">Editar Coordenadas Manuales</p>
                          
                          <div>
                            <label className="text-[9px] text-slate-400 block font-bold">Ubicación / Dirección</label>
                            <input
                              type="text"
                              value={manualLocationName}
                              onChange={(e) => setManualLocationName(e.target.value)}
                              placeholder="Ej: Av. de la Constitución 12, Madrid"
                              className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-400"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] text-slate-400 block font-bold">Latitud</label>
                              <input
                                type="number"
                                step="any"
                                value={manualLat}
                                onChange={(e) => setManualLat(e.target.value)}
                                placeholder="Ej: 40.4168"
                                className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-mono"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-400 block font-bold">Longitud</label>
                              <input
                                type="number"
                                step="any"
                                value={manualLng}
                                onChange={(e) => setManualLng(e.target.value)}
                                placeholder="Ej: -3.7038"
                                className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 font-mono"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleSaveCoordinates(b.id)}
                              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingBookingId(null)}
                              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold py-1 rounded-lg transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* UNMAPPED BOOKINGS NOTICE */}
          {unmappedBookings.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200/80 p-4 shadow-sm text-amber-900 space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber-600 shrink-0" />
                <h5 className="font-bold text-xs uppercase tracking-wider">
                  {unmappedBookings.length} Reservas sin coordenadas
                </h5>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                Algunas reservas no tienen ubicación o coordenadas asociadas. Haz clic en "Editar" en la lista de reservas para asignarles ubicación.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
