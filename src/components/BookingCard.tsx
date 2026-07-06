import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Hotel, 
  Plane, 
  Car, 
  Ticket, 
  Calendar, 
  ExternalLink, 
  Copy, 
  Check, 
  MapPin, 
  DollarSign, 
  User, 
  RefreshCw,
  FileText,
  Receipt,
  Compass
} from 'lucide-react';
import { TravelBooking, Trip, getTripColorClasses } from '../types';

interface BookingCardProps {
  key?: string;
  booking: TravelBooking;
  onReanalyze: (id: string) => void;
  isAnalyzing: boolean;
  trips: Trip[];
  onMoveToTrip: (bookingId: string, tripId: string) => void;
  onDelete?: (id: string) => void;
  onViewDocument?: (booking: TravelBooking) => void;
}

export default function BookingCard({ booking, onReanalyze, isAnalyzing, trips, onMoveToTrip, onDelete, onViewDocument }: BookingCardProps) {
  const [copied, setCopied] = useState(false);
  const currentTrip = trips.find(t => t.id === booking.tripId);
  const tripColorClasses = currentTrip ? getTripColorClasses(currentTrip.color) : null;

  const getCategoryStyles = (category?: string) => {
    switch (category) {
      case 'hotel':
        return {
          icon: Hotel,
          color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
          badge: 'bg-indigo-100 text-indigo-800',
          label: 'Hotel'
        };
      case 'flight':
        return {
          icon: Plane,
          color: 'text-sky-600 bg-sky-50 border-sky-100',
          badge: 'bg-sky-100 text-sky-800',
          label: 'Vuelo'
        };
      case 'car_rental':
        return {
          icon: Car,
          color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
          badge: 'bg-emerald-100 text-emerald-800',
          label: 'Alquiler de Auto'
        };
      case 'activity':
        return {
          icon: Ticket,
          color: 'text-amber-600 bg-amber-50 border-amber-100',
          badge: 'bg-amber-100 text-amber-800',
          label: 'Actividad'
        };
      case 'purchase':
        return {
          icon: Receipt,
          color: 'text-rose-600 bg-rose-50 border-rose-100',
          badge: 'bg-rose-100 text-rose-800',
          label: 'Compra / Factura'
        };
      default:
        return {
          icon: FileText,
          color: 'text-slate-600 bg-slate-50 border-slate-100',
          badge: 'bg-slate-100 text-slate-800',
          label: 'Viaje / Otro'
        };
    }
  };

  const styles = getCategoryStyles(booking.category);
  const IconComponent = styles.icon;

  const handleCopyCode = () => {
    if (booking.confirmationNumber) {
      navigator.clipboard.writeText(booking.confirmationNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    } catch (e) {}
    return dateStr;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full relative cursor-pointer"
      id={`booking-card-${booking.id}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, select, a, input')) return;
        onViewDocument?.(booking);
      }}
    >
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${styles.color}`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${styles.badge}`}>
                  {styles.label}
                </span>
                {currentTrip && (
                  <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${tripColorClasses?.badge}`}>
                    📍 {currentTrip.name}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-900 mt-1.5 leading-snug text-xs sm:text-sm">
                {booking.supplier || booking.title || booking.fileName}
              </h3>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(booking.id);
                }}
                title="Eliminar registro"
                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 disabled:opacity-50 transition-colors border border-transparent hover:border-rose-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            )}
            {!booking.id.startsWith('local-') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReanalyze(booking.id);
                }}
                disabled={isAnalyzing}
                title="Volver a escanear este archivo con IA"
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors border border-transparent hover:border-slate-200"
              >
                <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin text-slate-600' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Custom Title if supplier is present */}
        {booking.supplier && booking.title && booking.title !== booking.supplier && (
          <p className="text-xs font-semibold text-slate-700 mb-2">{booking.title}</p>
        )}

        {/* Dates */}
        <div className="space-y-1.5 mb-4 text-xs text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium text-slate-700">Inicio:</span>
            <span>
              {formatDisplayDate(booking.startDate) || 'Sin fecha'} {booking.startTime && `a las ${booking.startTime}`}
            </span>
          </div>
          {booking.endDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-medium text-slate-700">Fin:</span>
              <span>
                {formatDisplayDate(booking.endDate)} {booking.endTime && `a las ${booking.endTime}`}
              </span>
            </div>
          )}
        </div>

        {/* Quick Summary / Snippet */}
        {booking.summary && (
          <p className="text-xs text-slate-500 italic mb-4 border-l-2 border-slate-200 pl-2 leading-relaxed">
            "{booking.summary}"
          </p>
        )}

        {/* Attributes List */}
        <div className="space-y-2 text-xs text-slate-600 mb-4">
          {booking.confirmationNumber && (
            <div className="flex items-center justify-between bg-slate-50/50 p-2 rounded-xl border border-slate-200">
              <span className="text-slate-500">Localizador:</span>
              <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800">
                <span>{booking.confirmationNumber}</span>
                <button
                  onClick={handleCopyCode}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                  title="Copiar código"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}

          {booking.location && (
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-slate-500">Ubicación: </span>
                  <span className="text-slate-800 font-medium">{booking.location}</span>
                </div>
              </div>
              {booking.coordinates && typeof booking.coordinates.lat === 'number' && typeof booking.coordinates.lng === 'number' && (
                <div className="flex items-start gap-2 ml-5">
                  <span className="text-slate-400 text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                    {booking.coordinates.lat.toFixed(6)}, {booking.coordinates.lng.toFixed(6)}
                  </span>
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${booking.coordinates.lat},${booking.coordinates.lng}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[10px] text-blue-500 hover:underline mt-0.5"
                  >
                    Ver en mapa
                  </a>
                </div>
              )}
            </div>
          )}

          {booking.passengerOrGuestName && (
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <div>
                <span className="text-slate-500">A nombre de: </span>
                <span className="text-slate-800 font-medium">{booking.passengerOrGuestName}</span>
              </div>
            </div>
          )}

          {booking.details && (
            <div className="text-[11px] bg-slate-50/60 p-2.5 rounded-xl text-slate-500 border border-slate-200 max-h-[70px] overflow-y-auto leading-normal">
              {booking.details}
            </div>
          )}

          {/* Trip Selector Row */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
            <span className="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">Carpeta Viaje</span>
            <select
              value={booking.tripId || 'unassigned'}
              onChange={(e) => onMoveToTrip(booking.id, e.target.value)}
              className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-indigo-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-semibold cursor-pointer outline-none focus:ring-2 focus:ring-indigo-100 max-w-[170px] truncate transition-all"
            >
              <option value="unassigned">📂 Sin asignar</option>
              {trips.map(t => (
                <option key={t.id} value={t.id}>
                  🧭 {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Footer / Pricing & Links */}
      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
        <div>
          {booking.price ? (
            <div className="flex items-center text-emerald-600 font-bold text-xs sm:text-sm">
              <DollarSign className="w-3.5 h-3.5 -mr-0.5" />
              <span>{booking.price.toLocaleString('es-ES')}</span>
              <span className="text-[9px] text-slate-400 ml-1 uppercase font-bold">{booking.currency || 'USD'}</span>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 italic">Precio no detectado</span>
          )}
        </div>

        {booking.webViewLink && (
          <a
            href={booking.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700 font-medium transition-colors p-1 hover:bg-sky-50 rounded"
          >
            <span>Ver Archivo</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}
