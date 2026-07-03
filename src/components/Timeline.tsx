import React from 'react';
import { motion } from 'motion/react';
import { 
  Hotel, 
  Plane, 
  Car, 
  Ticket, 
  Calendar, 
  MapPin, 
  ArrowRight,
  FileText,
  Receipt
} from 'lucide-react';
import { TravelBooking, Trip, getTripColorClasses } from '../types';

interface TimelineProps {
  bookings: TravelBooking[];
  onSelectBooking: (id: string) => void;
  trips: Trip[];
  showTripBadge?: boolean;
}

export default function Timeline({ bookings, onSelectBooking, trips, showTripBadge = false }: TimelineProps) {
  // Sort bookings chronologically by startDate, and then startTime
  const sortedBookings = [...bookings]
    .filter(b => b.isTravelDocument)
    .sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      
      const dateA = new Date(a.startDate + (a.startTime ? `T${a.startTime}` : 'T00:00:00'));
      const dateB = new Date(b.startDate + (b.startTime ? `T${b.startTime}` : 'T00:00:00'));
      
      return dateA.getTime() - dateB.getTime();
    });

  const getCategoryTheme = (category?: string) => {
    switch (category) {
      case 'hotel':
        return {
          icon: Hotel,
          color: 'bg-indigo-500 text-white border-indigo-200',
          lineColor: 'border-indigo-100',
          textClass: 'text-indigo-600',
          label: 'Hospedaje'
        };
      case 'flight':
        return {
          icon: Plane,
          color: 'bg-sky-500 text-white border-sky-200',
          lineColor: 'border-sky-100',
          textClass: 'text-sky-600',
          label: 'Vuelo'
        };
      case 'car_rental':
        return {
          icon: Car,
          color: 'bg-emerald-500 text-white border-emerald-200',
          lineColor: 'border-emerald-100',
          textClass: 'text-emerald-600',
          label: 'Transporte'
        };
      case 'activity':
        return {
          icon: Ticket,
          color: 'bg-amber-500 text-white border-amber-200',
          lineColor: 'border-amber-100',
          textClass: 'text-amber-600',
          label: 'Actividad'
        };
      case 'purchase':
        return {
          icon: Receipt,
          color: 'bg-rose-500 text-white border-rose-200',
          lineColor: 'border-rose-100',
          textClass: 'text-rose-600',
          label: 'Compra / Factura'
        };
      default:
        return {
          icon: FileText,
          color: 'bg-slate-500 text-white border-slate-200',
          lineColor: 'border-slate-100',
          textClass: 'text-slate-600',
          label: 'Viaje / Otro'
        };
    }
  };

  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return 'Sin fecha';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', weekday: 'short' });
      }
    } catch (e) {}
    return dateStr;
  };

  if (sortedBookings.length === 0) {
    return (
      <div className="bg-slate-50 rounded-xl p-8 text-center border border-dashed border-slate-200">
        <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-slate-500 text-sm">No hay documentos de viajes ordenados para armar un itinerario.</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 sm:pl-8 py-4">
      {/* Vertical Line */}
      <div className="absolute left-9 sm:left-11 top-0 bottom-0 w-0.5 bg-slate-100" />

      <div className="space-y-8 relative">
        {sortedBookings.map((booking, index) => {
          const theme = getCategoryTheme(booking.category);
          const Icon = theme.icon;
          const bTrip = trips.find(t => t.id === booking.tripId);
          const bTripColor = bTrip ? getTripColorClasses(bTrip.color) : null;

          return (
            <motion.div
              key={booking.id}
              initial={{ opacity: 0, x: -15 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="relative flex gap-4 sm:gap-6 items-start group"
            >
              {/* Timeline Marker */}
              <div className="absolute -left-11 sm:-left-13 flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shadow-sm shrink-0 z-10 transition-transform duration-300 group-hover:scale-110">
                <div className={`p-1.5 rounded-full ${theme.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              {/* Booking Segment Card */}
              <button
                onClick={() => onSelectBooking(booking.id)}
                className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left shadow-sm hover:shadow transition-all duration-300 cursor-pointer"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 font-mono">
                      {formatDisplayDate(booking.startDate)}
                    </span>
                    {booking.startTime && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono font-medium">
                        {booking.startTime}
                      </span>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.textClass}`}>
                      • {theme.label}
                    </span>
                    {showTripBadge && bTrip && (
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${bTripColor?.badge}`}>
                        📍 {bTrip.name}
                      </span>
                    )}
                  </div>
                  
                  {booking.price && (
                    <span className="text-xs font-semibold text-emerald-600 font-mono">
                      {booking.price.toLocaleString('es-ES')} {booking.currency || 'USD'}
                    </span>
                  )}
                </div>

                <h4 className="font-semibold text-slate-800 text-sm leading-snug group-hover:text-sky-600 transition-colors">
                  {booking.supplier || booking.title || booking.fileName}
                </h4>

                {booking.location && (
                  <div className="flex flex-col gap-0.5 mt-1">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{booking.location}</span>
                    </div>
                    {booking.coordinates && (
                      <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono ml-4">
                        {booking.coordinates.lat.toFixed(4)}, {booking.coordinates.lng.toFixed(4)}
                      </div>
                    )}
                  </div>
                )}

                {booking.summary && (
                  <p className="text-xs text-slate-400 mt-2 line-clamp-1 italic">
                    "{booking.summary}"
                  </p>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
