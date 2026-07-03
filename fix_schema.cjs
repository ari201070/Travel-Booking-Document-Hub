const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const replacement = `        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isTravelDocument: {
              type: Type.BOOLEAN,
              description: "True si el documento es una reserva, ticket, pase de abordar, factura, recibo, boleta de restaurante, supermercado, peaje o cualquier compra. Siempre devuelve True para recibos y facturas."
            },
            category: {
              type: Type.STRING,
              description: "Debe ser uno de: 'hotel', 'flight', 'car_rental', 'activity', 'purchase', 'other_travel'"
            },
            supplier: {
              type: Type.STRING,
              description: "Nombre de la empresa proveedora (ej. Iberia, Marriott, Hertz, Flybondi, Booking, Civitatis)."
            },
            title: {
              type: Type.STRING,
              description: "Título corto descriptivo (ej. 'Reserva Hotel Sheraton', 'Vuelo Madrid - Buenos Aires')."
            },
            startDate: {
              type: Type.STRING,
              description: "Fecha de check-in, partida, inicio, o retiro (formato YYYY-MM-DD)."
            },
            startTime: {
              type: Type.STRING,
              description: "Hora de check-in, partida, o inicio (formato HH:MM o similar)."
            },
            endDate: {
              type: Type.STRING,
              description: "Fecha de check-out, devolución, o fin (formato YYYY-MM-DD)."
            },
            endTime: {
              type: Type.STRING,
              description: "Hora de check-out, devolución, o fin (formato HH:MM o similar)."
            },
            confirmationNumber: {
              type: Type.STRING,
              description: "Código de confirmación o localizador de reserva."
            },
            location: {
              type: Type.STRING,
              description: "Ubicación, ciudad, aeropuerto, o dirección física."
            },
            coordinates: {
              type: Type.OBJECT,
              description: "Coordenadas geográficas exactas del lugar de la reserva, evento o comercio. Si es una ciudad o negocio, usa su ubicación aproximada si no hay dirección exacta.",
              properties: {
                lat: {
                  type: Type.NUMBER,
                  description: "Latitud decimal."
                },
                lng: {
                  type: Type.NUMBER,
                  description: "Longitud decimal."
                }
              }
            },
            passengerOrGuestName: {
              type: Type.STRING,
              description: "Nombre del pasajero o huésped principal."
            },
            price: {
              type: Type.NUMBER,
              description: "Precio total numérico de la reserva."
            },
            currency: {
              type: Type.STRING,
              description: "Código de moneda del precio (ej. USD, EUR, ARS)."
            },
            details: {
              type: Type.STRING,
              description: "Detalles adicionales clave como tipo de habitación, asientos, equipaje, categoría de auto, etc."
            },
            summary: {
              type: Type.STRING,
              description: "Un resumen breve y profesional de 1 o 2 oraciones en español del documento de viaje."
            }
          },
          required: ["isTravelDocument"]
        }`;

code = code.replace(/responseSchema: \{[\s\S]*?required: \["isTravelDocument"\]\n\s*\}/g, replacement);
fs.writeFileSync('server.ts', code);
