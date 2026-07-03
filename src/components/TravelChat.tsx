import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Bot, 
  User, 
  HelpCircle, 
  Sparkles, 
  DollarSign, 
  Calendar,
  Plane
} from 'lucide-react';
import { ChatMessage, TravelBooking, Trip } from '../types';

interface TravelChatProps {
  bookings: TravelBooking[];
  trips: Trip[];
}

export default function TravelChat({ bookings, trips }: TravelChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const parsedBookings = bookings.filter(b => b.isTravelDocument);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Suggestion questions based on bookings
  const getSuggestions = () => {
    const hasHotels = parsedBookings.some(b => b.category === 'hotel');
    const hasFlights = parsedBookings.some(b => b.category === 'flight');
    
    const suggestions = [
      { text: '¿Cuánto gasté en total en mis reservas?', icon: DollarSign, color: 'text-emerald-500 bg-emerald-50' },
      { text: 'Hazme un resumen de mi itinerario', icon: Calendar, color: 'text-indigo-500 bg-indigo-50' }
    ];

    if (hasFlights) {
      suggestions.push({ text: '¿Cuáles son mis vuelos y horarios?', icon: Plane, color: 'text-sky-500 bg-sky-50' });
    }
    
    return suggestions;
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsLoading(true);

    try {
      const enrichedBookings = parsedBookings.map(b => {
        const trip = trips.find(t => t.id === b.tripId);
        return {
          ...b,
          tripName: trip ? trip.name : 'Sin asignar'
        };
      });

      const response = await fetch('/api/chat-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          bookings: enrichedBookings
        })
      });

      if (!response.ok) {
        throw new Error('No se pudo comunicar con el asistente de viaje');
      }

      const data = await response.json();
      
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        content: data.response || 'No recibí respuesta del asistente de viaje.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        content: 'Disculpa, ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(inputValue);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 flex flex-col h-[550px]" id="travel-chat-hub">
      {/* Header */}
      <div className="bg-slate-900 text-white p-4 rounded-t-2xl flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-500/25 rounded-lg border border-indigo-500/30">
            <Sparkles className="w-5 h-5 text-indigo-300 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-sm">Asistente de Itinerario</h3>
            <p className="text-[10px] text-slate-300">Pregúntame sobre tus vuelos, hoteles y gastos</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs bg-indigo-500/20 px-2.5 py-0.5 rounded-full border border-indigo-400/20 text-indigo-200 font-bold">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
          <span>Inteligente</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
              <Bot className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 text-sm">¿Cómo puedo ayudarte con tu viaje?</h4>
              <p className="text-xs text-slate-500 max-w-xs mt-1">
                Tengo acceso a tus {parsedBookings.length} reservas escaneadas de Google Drive. Pregúntame cosas como:
              </p>
            </div>

            {/* Suggestions Chips */}
            <div className="w-full max-w-sm flex flex-col gap-2 pt-2">
              {getSuggestions().map((sug, i) => (
                <button
                  key={i}
                  onClick={() => handleSendMessage(sug.text)}
                  className="flex items-center gap-2 text-xs text-left text-slate-700 hover:text-indigo-700 bg-white hover:bg-indigo-50/40 p-2.5 rounded-xl border border-slate-200 shadow-sm transition-all text-ellipsis overflow-hidden cursor-pointer"
                >
                  <div className={`p-1 rounded-lg ${sug.color}`}>
                    <sug.icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="truncate font-semibold">{sug.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'user' && (
                  <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center shrink-0 border border-indigo-100">
                    <Bot className="w-4 h-4 text-indigo-600" />
                  </div>
                )}
                
                <div className="flex flex-col max-w-[75%]">
                  <div
                    className={`p-3 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : 'bg-white text-slate-800 border border-slate-200 shadow-sm rounded-tl-none'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 self-end">{msg.timestamp}</span>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 bg-slate-900 text-white rounded-full flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-7 h-7 bg-indigo-50 rounded-full flex items-center justify-center shrink-0 border border-indigo-100">
                  <Bot className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm flex items-center gap-1.5 py-4 px-5">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 flex gap-2 bg-white rounded-b-2xl">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Escribe una pregunta sobre tus viajes..."
          disabled={isLoading}
          className="flex-1 bg-slate-50 text-xs border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all text-slate-800"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isLoading}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl transition-colors flex items-center justify-center shrink-0 cursor-pointer border border-transparent"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
