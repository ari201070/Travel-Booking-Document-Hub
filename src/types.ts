export type BookingCategory = 'hotel' | 'flight' | 'car_rental' | 'activity' | 'purchase' | 'other_travel';

export interface Trip {
  id: string;
  name: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  color: string; // tailwind base color like indigo, emerald, sky, rose, amber, purple
}

export interface TravelBooking {
  id: string; // matches Google Drive file ID
  fileName: string;
  isTravelDocument: boolean;
  category?: BookingCategory;
  supplier?: string;
  title?: string;
  startDate?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endDate?: string; // YYYY-MM-DD
  endTime?: string; // HH:MM
  confirmationNumber?: string;
  location?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  passengerOrGuestName?: string;
  price?: number;
  currency?: string;
  details?: string;
  summary?: string;
  webViewLink?: string;
  iconLink?: string;
  mimeType: string;
  tripId?: string; // Links this booking to a specific Trip
  source?: 'drive' | 'photos';
  baseUrl?: string;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  modifiedTime?: string;
  source?: 'drive' | 'photos';
  baseUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export function getTripColorClasses(color: string) {
  switch (color) {
    case 'indigo':
      return {
        bg: 'bg-indigo-50 border-indigo-100',
        text: 'text-indigo-700',
        badge: 'bg-indigo-100 text-indigo-800 border-indigo-200/60',
        accent: 'indigo-500',
        hoverBg: 'hover:bg-indigo-50/50',
        dot: 'bg-indigo-600',
        btnBg: 'bg-indigo-600 hover:bg-indigo-700'
      };
    case 'emerald':
      return {
        bg: 'bg-emerald-50 border-emerald-100',
        text: 'text-emerald-700',
        badge: 'bg-emerald-100 text-emerald-800 border-emerald-200/60',
        accent: 'emerald-500',
        hoverBg: 'hover:bg-emerald-50/50',
        dot: 'bg-emerald-600',
        btnBg: 'bg-emerald-600 hover:bg-emerald-700'
      };
    case 'sky':
      return {
        bg: 'bg-sky-50 border-sky-100',
        text: 'text-sky-700',
        badge: 'bg-sky-100 text-sky-800 border-sky-200/60',
        accent: 'sky-500',
        hoverBg: 'hover:bg-sky-50/50',
        dot: 'bg-sky-600',
        btnBg: 'bg-sky-600 hover:bg-sky-700'
      };
    case 'rose':
      return {
        bg: 'bg-rose-50 border-rose-100',
        text: 'text-rose-700',
        badge: 'bg-rose-100 text-rose-800 border-rose-200/60',
        accent: 'rose-500',
        hoverBg: 'hover:bg-rose-50/50',
        dot: 'bg-rose-600',
        btnBg: 'bg-rose-600 hover:bg-rose-700'
      };
    case 'amber':
      return {
        bg: 'bg-amber-50 border-amber-100',
        text: 'text-amber-700',
        badge: 'bg-amber-100 text-amber-800 border-amber-200/60',
        accent: 'amber-500',
        hoverBg: 'hover:bg-amber-50/50',
        dot: 'bg-amber-600',
        btnBg: 'bg-amber-600 hover:bg-amber-700'
      };
    case 'purple':
      return {
        bg: 'bg-purple-50 border-purple-100',
        text: 'text-purple-700',
        badge: 'bg-purple-100 text-purple-800 border-purple-200/60',
        accent: 'purple-500',
        hoverBg: 'hover:bg-purple-50/50',
        dot: 'bg-purple-600',
        btnBg: 'bg-purple-600 hover:bg-purple-700'
      };
    default:
      return {
        bg: 'bg-slate-50 border-slate-100',
        text: 'text-slate-700',
        badge: 'bg-slate-100 text-slate-800 border-slate-200/60',
        accent: 'slate-500',
        hoverBg: 'hover:bg-slate-50/50',
        dot: 'bg-slate-600',
        btnBg: 'bg-slate-600 hover:bg-slate-700'
      };
  }
}
