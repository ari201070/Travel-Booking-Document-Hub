import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import dotenv from "dotenv";
import { exec } from "child_process";
import { initDatabase, insertAnchor, generateAnchorId } from "./src/db.js";
import { getH3Index, checkLocationCache, updateSpatialCache } from "./src/spatial_cache.js";
import { generateContentWithRetry, formatGeminiError } from "./src/gemini.js";
import { processBatch } from "./src/batch-worker.js";

dotenv.config();

const GEOCODE_API_URL = process.env.GEOCODE_API_URL || "http://localhost:3001/api/geocode";

const app = express();
app.use(express.json({ limit: '20mb' }));

const PORT = 3000;

// API routes FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Endpoint to resolve public Google Photos sharing links
app.post("/api/resolve-photo-link", async (req, res) => {
  try {
    const { link } = req.body;
    if (!link) {
      return res.status(400).json({ error: "Falta el enlace" });
    }

    console.log(`Resolving Google Photos link: ${link}`);
    
    // Fetch the link to resolve redirect and get the page HTML
    const response = await fetch(link, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(400).json({ error: "No se pudo acceder al enlace de Google Fotos. Verifica que sea un enlace público." });
    }

    const html = await response.text();

    // Look for og:image meta tag
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i);

    let directUrl = "";
    if (ogImageMatch) {
      directUrl = ogImageMatch[1];
    } else {
      // Fallback: look for googleusercontent images inside the HTML
      const imgRegex = /"https:\/\/lh3\.googleusercontent\.com\/[a-zA-Z0-9_-]+"/g;
      const matches = html.match(imgRegex);
      if (matches && matches.length > 0) {
        directUrl = matches[0].replace(/"/g, '');
      }
    }

    if (!directUrl) {
      return res.status(400).json({ error: "No se pudo extraer la imagen del enlace. Asegúrate de que sea un enlace válido y público de Google Fotos." });
    }

    // Strip size modifiers from the end to get clean baseUrl
    if (directUrl.includes('=')) {
      const parts = directUrl.split('=');
      if (parts[parts.length - 1].match(/^[a-zA-Z0-9-]+$/i)) {
        directUrl = parts.slice(0, -1).join('=');
      }
    }

    console.log(`Successfully resolved to direct image URL: ${directUrl}`);

    return res.json({
      id: 'photo-resolved-' + Math.random().toString(36).substring(2, 11),
      name: 'Foto de Viaje Compartida.jpg',
      mimeType: 'image/jpeg',
      webViewLink: link,
      iconLink: directUrl,
      source: 'photos',
      baseUrl: directUrl
    });

  } catch (err: any) {
    console.error("Error resolving photos link:", err);
    res.status(500).json({ error: "Error al procesar el enlace de Google Fotos: " + err.message });
  }
});

// Analyze document endpoint
app.post("/api/analyze-doc", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Missing or invalid authorization header. Bearer token expected." });
    }
    const token = authHeader.split(' ')[1];

    const { fileId, mimeType, name, source, baseUrl } = req.body;
    if (!fileId || !mimeType || !name) {
      return res.status(400).json({ error: "Missing required fields: fileId, mimeType, name" });
    }

    console.log(`Analyzing file: "${name}" (${mimeType}) - ID: ${fileId} - Source: ${source || 'drive'}`);

    let fileBuffer: Buffer | null = null;
    let fileText: string | null = null;

    try {
      if (source === 'photos') {
        // Google Photos: download image bytes from baseUrl
        // Append '=w2048' to get a high-quality web-optimized image suitable for Gemini parsing
        const photoUrl = `${baseUrl || ''}=w2048`;
        console.log(`Downloading Google Photo from URL: ${photoUrl}`);
        
        let downloadRes = await fetch(photoUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // Fallback for public googleusercontent URLs or if auth fails
        if (!downloadRes.ok) {
          console.log(`Retrying download of photo without Authorization header for URL: ${photoUrl}`);
          downloadRes = await fetch(photoUrl);
        }

        if (downloadRes.ok) {
          const arrayBuffer = await downloadRes.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
        } else {
          console.warn(`Could not download Google Photo ${fileId}. Status: ${downloadRes.status}`);
        }
      } else if (mimeType.startsWith('application/vnd.google-apps.')) {
        // For Google Docs/Sheets, we export them as text
        let exportMimeType = 'text/plain';
        if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          exportMimeType = 'text/csv';
        }
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
        const exportRes = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (exportRes.ok) {
          fileText = await exportRes.text();
        } else {
          console.warn(`Could not export Google Workspace file ${fileId}. Status: ${exportRes.status}`);
        }
      } else {
        // Standard files: download binary bytes
        const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const downloadRes = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (downloadRes.ok) {
          const arrayBuffer = await downloadRes.arrayBuffer();
          fileBuffer = Buffer.from(arrayBuffer);
        } else {
          console.warn(`Could not download standard binary file ${fileId}. Status: ${downloadRes.status}`);
        }
      }
    } catch (downloadErr) {
      console.error(`Error downloading file content for ${fileId}:`, downloadErr);
      // We will still proceed to Gemini with filename metadata as fallback
    }

    // Build the parts for Gemini
    const contents: any[] = [];
    const mimeTypeForGemini = source === 'photos' ? 'image/jpeg' : mimeType;
    let prompt = `Analiza visualmente este documento de forma exhaustiva. 
- Si es una captura de pantalla de celular, ignora los elementos de la interfaz de la app o del sistema (batería, hora, notificaciones).
- Si es una foto de un ticket físico (como un restaurante o lavadero), ignora arrugas, sombras o texto difuso de fondo.

Soporte Multilingüe Universal: El pipeline de extracción debe ser capaz de procesar archivos en cualquier idioma (Español, Hebreo, Italiano, Esloveno, Chino, etc.). El set de caracteres de entrada se asume UTF-8 nativo. Sin importar el idioma, debes mapear semánticamente los conceptos clave a las categorías predefinidas. Por ejemplo, si detectas términos equivalentes a 'bus', 'colectivo', 'autobús', 'tren', 'subway' o caracteres eslavos/asiáticos de transporte, clasifícalos correctamente como 'TRANSPORT'. Si detectas facturas, tickets de compra, supermercado o comida, clasifícalos como 'SHOPPING_RECEIPTS'.

Determina si contiene una reserva de viaje o CUALQUIER TIPO DE GASTO O RECIBO (lavandería, supermercados, peajes, restaurantes, compras generales, etc.). Absolutamente cualquier ticket de compra se considera un gasto válido.

La propiedad \`location\` debe ser una cadena limpia con la estructura estándar de mapas abiertos para optimizar la geocodificación local FOSS: '[Nombre del Comercio/Hito], [Ciudad], [País]' (ej: 'Concorde Hotel, Bariloche, Argentina' o 'Urbia Cataratas, Foz do Iguacu, Brasil'). No utilices ninguna referencia a Google Maps en tu formato.

Documento original: Nombre: "${name}", MimeType: "${mimeTypeForGemini}".`;

    if (fileBuffer) {
      if (mimeTypeForGemini === 'application/pdf') {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: fileBuffer });
        await (parser as any).load();
        const pdfData = await parser.getText();
        const text = pdfData.text.slice(0, 15000);
        parser.destroy();
        prompt += `\nContenido extraído del PDF:\n${text}`;
      } else if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimeTypeForGemini)) {
        contents.push({
          inlineData: {
            mimeType: mimeTypeForGemini,
            data: fileBuffer.toString('base64'),
          }
        });
        prompt += `\nLa imagen está adjunta. Analiza su contenido visual.`;
      } else {
        const textContent = fileBuffer.toString('utf-8').slice(0, 12000);
        prompt += `\nContenido de texto extraído del archivo original:\n${textContent}`;
      }
    } else if (fileText) {
      prompt += `\nContenido exportado del documento:\n${fileText.slice(0, 12000)}`;
    } else {
      prompt += `\nNota: No se pudo descargar el contenido directamente. Por favor, infiere si es un documento de viaje y clasifícalo en base a su nombre descriptivo "${name}".`;
    }

    contents.push(prompt);

    // Call Gemini with JSON Schema output and resilient retry mechanism
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
                responseSchema: {
          type: Type.OBJECT,
          properties: {
            isTravelDocument: {
              type: Type.BOOLEAN,
              description: "True si el documento es una reserva, o CUALQUIER recibo, boleta, o ticket de compra (incluyendo lavaderos, tiendas, supermercados). Siempre devuelve True si el documento es un ticket o factura."
            },
            category: {
              type: Type.STRING,
              description: "Debe ser uno de: 'HOTEL', 'FLIGHT', 'CAR_RENTAL', 'TRANSPORT', 'ACTIVITY', 'SHOPPING_RECEIPTS'."
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
              description: "Ubicación limpia en formato estándar de mapas abiertos para optimizar geocodificación FOSS local: '[Nombre del Comercio/Hito], [Ciudad], [País]'. Sin referencias a Google Maps."
            },
            extraction_notes: {
              type: Type.STRING,
              description: "Razonamiento breve sobre cómo se extrajo la información o si hubo dudas en la lectura."
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
          required: ["extraction_notes", "isTravelDocument"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedResult = JSON.parse(resultText.trim());

    if (parsedResult.location) {
      try {
        const cached = checkLocationCache(parsedResult.location);
        if (cached) {
          parsedResult.coordinates = { lat: cached.latitude, lng: cached.longitude };
        } else {
          const geoResponse = await fetch(`${GEOCODE_API_URL}?address=${encodeURIComponent(parsedResult.location)}`);
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.lat && geoData.lng) {
              const lat = parseFloat(Number(geoData.lat).toFixed(4));
              const lng = parseFloat(Number(geoData.lng).toFixed(4));
              parsedResult.coordinates = { lat, lng };
              const h3 = getH3Index(lat, lng);
              parsedResult.h3_index = h3;
              updateSpatialCache(h3, parsedResult.location, lat, lng);
            }
          }
        }
      } catch (geoError: any) {
        console.warn("[Geocoding] Servicio local /api/analyze-doc no disponible:", geoError.message);
      }
    }

    try {
      const anchorId = generateAnchorId(name);
      insertAnchor({
        id: anchorId,
        location: parsedResult.location,
        latitude: parsedResult.coordinates?.lat,
        longitude: parsedResult.coordinates?.lng,
        is_travel_document: parsedResult.isTravelDocument,
        h3_index: parsedResult.h3_index,
        raw_json: JSON.stringify(parsedResult),
      });
    } catch (dbErr: any) {
      console.warn("[DB] Error registrando anchor en /api/analyze-doc:", dbErr.message);
    }

    return res.json(parsedResult);

  } catch (error: any) {
    console.error("Error analyzing document:", error);
    const formatted = formatGeminiError(error);
    res.status(500).json(formatted);
  }
});

// Analyze local file endpoint
app.post("/api/analyze-local", async (req, res) => {
  try {
    const { name, mimeType, base64Data } = req.body;
    if (!name || !mimeType || !base64Data) {
      return res.status(400).json({ error: "Missing required fields: name, mimeType, base64Data" });
    }

    console.log(`Analyzing local file: "${name}" (${mimeType})`);

    const contents: any[] = [];
    let prompt = `Analiza visualmente este documento de forma exhaustiva. 
- Si es una captura de pantalla de celular, ignora los elementos de la interfaz de la app o del sistema (batería, hora, notificaciones).
- Si es una foto de un ticket físico (como un restaurante o lavadero), ignora arrugas, sombras o texto difuso de fondo.

Soporte Multilingüe Universal: El pipeline de extracción debe ser capaz de procesar archivos en cualquier idioma (Español, Hebreo, Italiano, Esloveno, Chino, etc.). El set de caracteres de entrada se asume UTF-8 nativo. Sin importar el idioma, debes mapear semánticamente los conceptos clave a las categorías predefinidas. Por ejemplo, si detectas términos equivalentes a 'bus', 'colectivo', 'autobús', 'tren', 'subway' o caracteres eslavos/asiáticos de transporte, clasifícalos correctamente como 'TRANSPORT'. Si detectas facturas, tickets de compra, supermercado o comida, clasifícalos como 'SHOPPING_RECEIPTS'.

Determina si contiene una reserva de viaje o CUALQUIER TIPO DE GASTO O RECIBO (lavandería, supermercados, peajes, restaurantes, compras generales, etc.). Absolutamente cualquier ticket de compra se considera un gasto válido.

La propiedad \`location\` debe ser una cadena limpia con la estructura estándar de mapas abiertos para optimizar la geocodificación local FOSS: '[Nombre del Comercio/Hito], [Ciudad], [País]' (ej: 'Concorde Hotel, Bariloche, Argentina' o 'Urbia Cataratas, Foz do Iguacu, Brasil'). No utilices ninguna referencia a Google Maps en tu formato.

Documento original: Nombre: "${name}", MimeType: "${mimeType}".`;

    if (mimeType === 'application/pdf') {
      const { PDFParse } = await import("pdf-parse");
      const buf = Buffer.from(base64Data, 'base64');
      const parser = new PDFParse({ data: buf });
      await (parser as any).load();
      const pdfData = await parser.getText();
      const text = pdfData.text.slice(0, 15000);
      parser.destroy();
      prompt += `\nContenido extraído del PDF:\n${text}`;
    } else if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimeType)) {
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        }
      });
      prompt += `\nLa imagen está adjunta. Analiza su contenido visual.`;
    } else {
      // Decode base64 to text string
      try {
        const textContent = Buffer.from(base64Data, 'base64').toString('utf-8').slice(0, 12000);
        prompt += `\nContenido de texto extraído del archivo original:\n${textContent}`;
      } catch (decodeErr) {
        prompt += `\nNota: No se pudo decodificar el contenido de texto. Por favor, infiere si es un documento de viaje y clasifícalo en base a su nombre descriptivo "${name}".`;
      }
    }

    contents.push(prompt);

    // Call Gemini with JSON Schema output and resilient retry mechanism
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents,
      config: {
        responseMimeType: "application/json",
                responseSchema: {
          type: Type.OBJECT,
          properties: {
            isTravelDocument: {
              type: Type.BOOLEAN,
              description: "True si el documento es una reserva, o CUALQUIER recibo, boleta, o ticket de compra (incluyendo lavaderos, tiendas, supermercados). Siempre devuelve True si el documento es un ticket o factura."
            },
            category: {
              type: Type.STRING,
              description: "Debe ser uno de: 'HOTEL', 'FLIGHT', 'CAR_RENTAL', 'TRANSPORT', 'ACTIVITY', 'SHOPPING_RECEIPTS'."
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
              description: "Ubicación limpia en formato estándar de mapas abiertos para optimizar geocodificación FOSS local: '[Nombre del Comercio/Hito], [Ciudad], [País]'. Sin referencias a Google Maps."
            },
            extraction_notes: {
              type: Type.STRING,
              description: "Razonamiento breve sobre cómo se extrajo la información o si hubo dudas en la lectura."
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
          required: ["extraction_notes", "isTravelDocument"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedResult = JSON.parse(resultText.trim());

    if (parsedResult.location) {
      try {
        const cached = checkLocationCache(parsedResult.location);
        if (cached) {
          parsedResult.coordinates = { lat: cached.latitude, lng: cached.longitude };
        } else {
          const geoResponse = await fetch(`${GEOCODE_API_URL}?address=${encodeURIComponent(parsedResult.location)}`);
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.lat && geoData.lng) {
              const lat = parseFloat(Number(geoData.lat).toFixed(4));
              const lng = parseFloat(Number(geoData.lng).toFixed(4));
              parsedResult.coordinates = { lat, lng };
              const h3 = getH3Index(lat, lng);
              parsedResult.h3_index = h3;
              updateSpatialCache(h3, parsedResult.location, lat, lng);
            }
          }
        }
      } catch (geoError: any) {
        console.warn("[Geocoding] Servicio local /api/analyze-local no disponible:", geoError.message);
      }
    }

    try {
      const anchorId = generateAnchorId(name);
      insertAnchor({
        id: anchorId,
        location: parsedResult.location,
        latitude: parsedResult.coordinates?.lat,
        longitude: parsedResult.coordinates?.lng,
        is_travel_document: parsedResult.isTravelDocument,
        h3_index: parsedResult.h3_index,
        raw_json: JSON.stringify(parsedResult),
      });
    } catch (dbErr: any) {
      console.warn("[DB] Error registrando anchor en /api/analyze-local:", dbErr.message);
    }

    return res.json(parsedResult);

  } catch (error: any) {
    console.error("Error analyzing local document:", error);
    const formatted = formatGeminiError(error);
    res.status(500).json(formatted);
  }
});

// Chat with itinerary context
app.post("/api/chat-itinerary", async (req, res) => {
  try {
    const { messages, bookings } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing or invalid 'messages' array" });
    }

    const formattedBookings = JSON.stringify(bookings || [], null, 2);
    const systemInstruction = `Eres un asistente de viajes personal, inteligente, empático y experto. 
Ayudas al usuario a organizar y responder preguntas sobre sus reservas de viaje (vuelos, hoteles, alquiler de autos y tickets de actividades).

A continuación, tienes la lista estructurada de reservas confirmadas que hemos escaneado de su cuenta de Google Drive:
${formattedBookings}

Por favor, utiliza esta lista para responder a las preguntas del usuario de forma precisa y servicial en español. 
- Si el usuario te pregunta por los costos de los hoteles, vuelos o total de gastos, haz las cuentas matemáticas necesarias.
- Si te pregunta por fechas, horas, ubicaciones o detalles de aerolíneas, extrae las fechas y horarios de los datos provistos.
- Mantén tus respuestas conversacionales, claras y concisas. Evita responder con terminología técnica innecesaria.
- Si no hay datos disponibles en la lista para responder a una pregunta en particular, indícalo amablemente sin inventar datos.`;

    // Map client messages to Gemini content format
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Call Gemini with resilient retry mechanism
    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    return res.json({ response: response.text });

  } catch (error: any) {
    console.error("Error in chat itinerary:", error);
    const formatted = formatGeminiError(error);
    res.status(500).json(formatted);
  }
});

// Batch analyze endpoint
app.post("/api/batch-analyze", async (req, res) => {
  try {
    const { files, concurrency } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "Missing or empty 'files' array" });
    }

    console.log(`[Batch] Iniciando lote de ${files.length} documentos (concurrencia: ${concurrency || 2})`);

    // Process the batch
    const result = await processBatch(files, concurrency || 2);

    const totalTravelDocs = result.results.filter((r) => r.success && r.isTravelDocument).length;

    return res.json({
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      travelDocuments: totalTravelDocs,
      results: result.results,
    });
  } catch (error: any) {
    console.error("Error in batch analyze:", error);
    const formatted = formatGeminiError(error);
    res.status(500).json(formatted);
  }
});

// Vite middleware and static files
async function startServer() {
  await initDatabase();
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    exec('start http://localhost:3000');
  });
}

startServer();
