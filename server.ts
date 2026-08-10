import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// Ensure Gemini API Key is present with robust fallbacks
// We prioritize custom keys from .env or .env.example over process.env to allow user overrides
let apiKey = "";

function sanitizeKey(key: string): string {
  if (!key) return "";
  return key.trim().replace(/^["']|["']$/g, '').trim();
}

// 1. Check if .env file exists and has a valid custom key
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    if (envConfig.GEMINI_API_KEY && envConfig.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && envConfig.GEMINI_API_KEY.trim() !== "") {
      apiKey = sanitizeKey(envConfig.GEMINI_API_KEY);
      process.env.GEMINI_API_KEY = apiKey;
    }
  } catch (err) {
    console.error("Failed to parse .env:", err);
  }
}

// 2. Check if .env.example exists and has a valid custom key
if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
  const exampleEnvPath = path.join(process.cwd(), '.env.example');
  if (fs.existsSync(exampleEnvPath)) {
    try {
      const exampleConfig = dotenv.parse(fs.readFileSync(exampleEnvPath));
      if (exampleConfig.GEMINI_API_KEY && exampleConfig.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && exampleConfig.GEMINI_API_KEY.trim() !== "") {
        apiKey = sanitizeKey(exampleConfig.GEMINI_API_KEY);
        process.env.GEMINI_API_KEY = apiKey;
        console.log("Successfully loaded fallback GEMINI_API_KEY from .env.example");
      }
    } catch (err) {
      console.error("Failed to parse fallback .env.example:", err);
    }
  }
}

// 3. Fallback to pre-existing process.env.GEMINI_API_KEY
if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
  apiKey = sanitizeKey(process.env.GEMINI_API_KEY || "");
}

if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in environment variables. Gemini features will fail.");
} else {
  const maskedKey = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "SHORT_KEY";
  console.log(`Successfully loaded and sanitized GEMINI_API_KEY: ${maskedKey}`);
}

// Initialize Gemini SDK with custom user agent telemetry
const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Resilient helper to call Gemini with exponential backoff on 429/quota limits
async function generateContentWithRetry(options: any, maxRetries = 3, initialDelayMs = 2500): Promise<any> {
  let attempt = 0;
  let hasFallenBack = false;
  while (true) {
    try {
      return await ai.models.generateContent(options);
    } catch (error: any) {
      attempt++;
      const errorString = JSON.stringify(error) || '';
      const errorMessage = error.message || '';
      const isRateLimit = 
        error.status === 'RESOURCE_EXHAUSTED' || 
        error.statusCode === 429 ||
        error.status === 429 ||
        error.statusCode === 503 ||
        error.status === 503 ||
        error.status === 'UNAVAILABLE' ||
        errorMessage.includes('503') ||
        errorMessage.includes('high demand') ||
        errorMessage.includes('429') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') || 
        errorMessage.includes('Quota exceeded') ||
        errorMessage.includes('rate-limits') ||
        errorString.includes('429') || 
        errorString.includes('RESOURCE_EXHAUSTED') || 
        errorString.includes('503') || 
        errorString.includes('UNAVAILABLE') || 
        errorString.includes('high demand');

      if (isRateLimit) {
        // If we hit a rate limit or daily quota on gemini-3.5-flash, automatically fallback to gemini-3.1-flash-lite
        if (options.model === "gemini-3.5-flash" && !hasFallenBack) {
          console.warn("[Gemini API] Quota/Rate limit exceeded on gemini-3.5-flash. Falling back to more generous gemini-3.1-flash-lite...");
          options.model = "gemini-3.1-flash-lite";
          hasFallenBack = true;
          attempt = 0; // Reset attempts for the fallback model
          continue;
        }

        if (attempt <= maxRetries) {
          const delay = initialDelayMs * Math.pow(2.2, attempt - 1) + Math.random() * 1000;
          console.warn(`[Gemini API] Rate limit or Quota exceeded detected on ${options.model}. Retrying attempt ${attempt}/${maxRetries} in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
}

// Format Gemini API errors beautifully into user-facing localized Spanish message
function formatGeminiError(error: any): { error: string, details: string, code?: string } {
  const errorString = error?.message || String(error || '');
  let parsedMsg = errorString;
  let isQuotaExceeded = false;
  let isHighDemand = false;

  try {
    if (errorString.startsWith('{') || errorString.includes('"error"')) {
      const startIdx = errorString.indexOf('{');
      const parsed = JSON.parse(errorString.substring(startIdx));
      if (parsed.error && parsed.error.message) {
        parsedMsg = parsed.error.message;
      }
    }
  } catch (e) {
    // ignore
  }

  // Check common quota/rate limit indicators
  if (
    error?.statusCode === 503 || 
    error?.status === 503 || 
    error?.status === 'UNAVAILABLE' || 
    parsedMsg.includes('503') || 
    parsedMsg.includes('high demand') || 
    parsedMsg.includes('UNAVAILABLE')
  ) {
    isHighDemand = true;
  }

  if (
    error?.status === 'RESOURCE_EXHAUSTED' || 
    error?.statusCode === 429 || 
    error?.status === 429 ||
    parsedMsg.includes('429') ||
    parsedMsg.includes('quota') ||
    parsedMsg.includes('Quota exceeded') ||
    parsedMsg.includes('RESOURCE_EXHAUSTED') ||
    parsedMsg.includes('limit') ||
    parsedMsg.includes('rate-limits')
  ) {
    isQuotaExceeded = true;
  }

  if (isHighDemand) {
    return {
      error: "Servicio temporalmente saturado (503)",
      details: "El servicio de inteligencia artificial está experimentando una alta demanda y está temporalmente saturado. Por favor, espera unos minutos e inténtalo de nuevo.",
      code: "HIGH_DEMAND"
    };
  }

  if (isQuotaExceeded) {
    return {
      error: "Límite de cuota de IA alcanzado (429)",
      details: "Has alcanzado la cuota de consultas gratuitas de la API de Gemini (20 solicitudes diarias). Para continuar analizando documentos, por favor añade una clave API de Gemini en la configuración de la aplicación.",
      code: "QUOTA_EXCEEDED"
    };
  }

  return {
    error: "Error en el análisis de documento",
    details: parsedMsg || "Ocurrió un error inesperado al procesar el archivo con el modelo Gemini.",
    code: "GENERIC_ERROR"
  };
}

const app = express();
app.use(express.json({ limit: '50mb' }));

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
      signal: AbortSignal.timeout(10000),
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
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token}` },
        });

        // Fallback for public googleusercontent URLs or if auth fails
        if (!downloadRes.ok) {
          console.log(`Retrying download of photo without Authorization header for URL: ${photoUrl}`);
          downloadRes = await fetch(photoUrl, { signal: AbortSignal.timeout(15000) });
        }

        if (downloadRes.ok) {
          const cl = downloadRes.headers.get('content-length');
          if (cl && parseInt(cl, 10) > 20 * 1024 * 1024) throw new Error('File too large');
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
          signal: AbortSignal.timeout(15000),
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
          signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${token}` },
        });

        if (downloadRes.ok) {
          const cl = downloadRes.headers.get('content-length');
          if (cl && parseInt(cl, 10) > 20 * 1024 * 1024) throw new Error('File too large');
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
    let prompt = `Analiza este documento para determinar si contiene una reserva de viaje o CUALQUIER TIPO DE GASTO O RECIBO (incluyendo facturas de lavandería, supermercados, tiendas, peajes, restaurantes, compras generales, etc), y extrae toda la información estructurada relevante. Absolutamente cualquier ticket o recibo de compra se considera un gasto de viaje.
Documento original: Nombre: "${name}", MimeType: "${mimeTypeForGemini}".`;

    if (fileBuffer) {
      const supportedBinaryTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (supportedBinaryTypes.includes(mimeTypeForGemini)) {
        contents.push({
          inlineData: {
            mimeType: mimeTypeForGemini,
            data: fileBuffer.toString('base64'),
          }
        });
        prompt += `\nEl archivo binario está adjunto. Analiza el contenido visual o texto embebido de este archivo para extraer todos los detalles.`;
      } else {
        // Raw text file or other downloadable text format
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
      model: "gemini-3.5-flash",
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
              description: "¡MUY IMPORTANTE! Debes extraer la DIRECCIÓN FÍSICA EXACTA (Calle, número, ciudad, provincia, pais) si aparece en el ticket. Si no aparece, extrae el nombre del lugar y ciudad."
            },
            coordinates: {
              type: Type.OBJECT,
              description: "¡MUY IMPORTANTE! Coordenadas geográficas exactas del lugar. Si es un restaurante, tienda o factura sin dirección, DEBES inferir y devolver latitud y longitud basándote en tu conocimiento general.",
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
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedResult = JSON.parse(resultText.trim());
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
    let prompt = `Analiza este documento para determinar si contiene una reserva de viaje o CUALQUIER TIPO DE GASTO O RECIBO (incluyendo facturas de lavandería, supermercados, tiendas, peajes, restaurantes, compras generales, etc), y extrae toda la información estructurada relevante. Absolutamente cualquier ticket o recibo de compra se considera un gasto de viaje.
Documento original: Nombre: "${name}", MimeType: "${mimeType}".`;

    const supportedBinaryTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (supportedBinaryTypes.includes(mimeType)) {
      contents.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        }
      });
      prompt += `\nEl archivo binario está adjunto. Analiza el contenido visual o texto embebido de este archivo para extraer todos los detalles.`;
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
      model: "gemini-3.5-flash",
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
              description: "¡MUY IMPORTANTE! Debes extraer la DIRECCIÓN FÍSICA EXACTA (Calle, número, ciudad, provincia, pais) si aparece en el ticket. Si no aparece, extrae el nombre del lugar y ciudad."
            },
            coordinates: {
              type: Type.OBJECT,
              description: "¡MUY IMPORTANTE! Coordenadas geográficas exactas del lugar. Si es un restaurante, tienda o factura sin dirección, DEBES inferir y devolver latitud y longitud basándote en tu conocimiento general.",
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
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedResult = JSON.parse(resultText.trim());
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
      model: "gemini-3.5-flash",
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

// Vite middleware and static files
async function startServer() {
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
  });
}

startServer();
