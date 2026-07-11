import { generateContentWithRetry } from "./gemini.js";
import { Type } from "@google/genai";
import { getH3Index, checkLocationCache, updateSpatialCache } from "./spatial_cache.js";
import { insertAnchor, generateAnchorId } from "./db.js";
import { PDFParse } from "pdf-parse";

const GEOCODE_API_URL = process.env.GEOCODE_API_URL || "http://localhost:3001/api/geocode";

const SYSTEM_PROMPT_BASE = `Analiza visualmente este documento de forma exhaustiva. 
- Si es una captura de pantalla de celular, ignora los elementos de la interfaz de la app o del sistema (batería, hora, notificaciones).
- Si es una foto de un ticket físico (como un restaurante o lavadero), ignora arrugas, sombras o texto difuso de fondo.

Soporte Multilingüe Universal: El pipeline de extracción debe ser capaz de procesar archivos en cualquier idioma (Español, Hebreo, Italiano, Esloveno, Chino, etc.). El set de caracteres de entrada se asume UTF-8 nativo. Sin importar el idioma, debes mapear semánticamente los conceptos clave a las categorías predefinidas. Por ejemplo, si detectas términos equivalentes a 'bus', 'colectivo', 'autobús', 'tren', 'subway' o caracteres eslavos/asiáticos de transporte, clasifícalos correctamente como 'TRANSPORT'. Si detectas facturas, tickets de compra, supermercado o comida, clasifícalos como 'SHOPPING_RECEIPTS'.

Determina si contiene una reserva de viaje o CUALQUIER TIPO DE GASTO O RECIBO (lavandería, supermercados, peajes, restaurantes, compras generales, etc.). Absolutamente cualquier ticket de compra se considera un gasto válido.

La propiedad \`location\` debe ser una cadena limpia con la estructura estándar de mapas abiertos para optimizar la geocodificación local FOSS: '[Nombre del Comercio/Hito], [Ciudad], [País]' (ej: 'Concorde Hotel, Bariloche, Argentina' o 'Urbia Cataratas, Foz do Iguacu, Brasil'). No utilices ninguna referencia a Google Maps en tu formato.`;

const SUPPORTED_IMAGE = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    extraction_notes: { type: Type.STRING, description: "Razonamiento breve sobre cómo se extrajo la información o si hubo dudas en la lectura." },
    isTravelDocument: { type: Type.BOOLEAN, description: "True si el documento es una reserva, o CUALQUIER recibo, boleta, o ticket de compra." },
    category: { type: Type.STRING, description: "Debe ser uno de: 'HOTEL', 'FLIGHT', 'CAR_RENTAL', 'TRANSPORT', 'ACTIVITY', 'SHOPPING_RECEIPTS'." },
    supplier: { type: Type.STRING, description: "Nombre de la empresa proveedora." },
    title: { type: Type.STRING, description: "Título corto descriptivo." },
    startDate: { type: Type.STRING, description: "Fecha de check-in, partida, inicio (YYYY-MM-DD)." },
    startTime: { type: Type.STRING, description: "Hora de check-in, partida, inicio." },
    endDate: { type: Type.STRING, description: "Fecha de check-out, devolución, fin (YYYY-MM-DD)." },
    endTime: { type: Type.STRING, description: "Hora de check-out, devolución, fin." },
    confirmationNumber: { type: Type.STRING, description: "Código de confirmación o localizador." },
    location: { type: Type.STRING, description: "Ubicación limpia en formato estándar de mapas abiertos para optimizar geocodificación FOSS local: '[Nombre del Comercio/Hito], [Ciudad], [País]'. Sin referencias a Google Maps." },
    passengerOrGuestName: { type: Type.STRING, description: "Nombre del pasajero o huésped principal." },
    price: { type: Type.NUMBER, description: "Precio total numérico." },
    currency: { type: Type.STRING, description: "Código de moneda (USD, EUR, ARS)." },
    details: { type: Type.STRING, description: "Detalles adicionales clave." },
    summary: { type: Type.STRING, description: "Resumen breve y profesional en español." },
  },
  required: ["extraction_notes", "isTravelDocument"],
};

export type BatchFile = {
  name: string;
  mimeType: string;
  base64Data?: string;
  fileBuffer?: Buffer;
  fileText?: string;
};

export type BatchResult = {
  file: string;
  success: boolean;
  error?: string;
  anchorId?: string;
  isTravelDocument?: boolean;
  location?: string;
  coordinates?: { lat: number; lng: number } | null;
};

async function analyzeSingleFile(file: BatchFile): Promise<BatchResult> {
  const { name, mimeType, base64Data, fileBuffer, fileText } = file;

  try {
    let prompt = `${SYSTEM_PROMPT_BASE}\n\nDocumento original: Nombre: "${name}", MimeType: "${mimeType}".`;
    const contents: any[] = [];

    if (mimeType === "application/pdf") {
      const buf = base64Data ? Buffer.from(base64Data, "base64") : fileBuffer;
      if (buf) {
        const parser = new PDFParse({ data: buf });
        await (parser as any).load();
        const pdfData = await parser.getText();
        const text = pdfData.text.slice(0, 15000);
        parser.destroy();
        prompt += `\nContenido extraído del PDF:\n${text}`;
      }
    } else if (base64Data && SUPPORTED_IMAGE.includes(mimeType)) {
      contents.push({ inlineData: { mimeType, data: base64Data } });
      prompt += `\nLa imagen está adjunta. Analiza su contenido visual.`;
    } else if (base64Data) {
      const text = Buffer.from(base64Data, "base64").toString("utf-8").slice(0, 12000);
      prompt += `\nContenido de texto extraído:\n${text}`;
    } else if (fileBuffer && SUPPORTED_IMAGE.includes(mimeType)) {
      contents.push({ inlineData: { mimeType, data: fileBuffer.toString("base64") } });
      prompt += `\nLa imagen está adjunta. Analiza su contenido visual.`;
    } else if (fileBuffer) {
      prompt += `\nContenido de texto:\n${fileBuffer.toString("utf-8").slice(0, 12000)}`;
    } else if (fileText) {
      prompt += `\nContenido exportado:\n${fileText.slice(0, 12000)}`;
    }

    contents.push(prompt);

    const response = await generateContentWithRetry({
      model: "gemini-2.5-flash",
      contents,
      config: { responseMimeType: "application/json", responseSchema },
    });

    const resultText = response.text;
    if (!resultText) throw new Error("Respuesta vacía de Gemini");

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
      } catch {
        // geocoding error, continue without coordinates
      }
    }

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

    return {
      file: name,
      success: true,
      anchorId,
      isTravelDocument: parsedResult.isTravelDocument,
      location: parsedResult.location,
      coordinates: parsedResult.coordinates || null,
    };
  } catch (err: any) {
    return {
      file: name,
      success: false,
      error: err.message || String(err),
    };
  }
}

export async function processBatch(
  files: BatchFile[],
  concurrency: number = 2,
  onProgress?: (done: number, total: number, result: BatchResult) => void,
): Promise<{ total: number; succeeded: number; failed: number; results: BatchResult[] }> {
  const results: BatchResult[] = [];
  let index = 0;

  async function worker() {
    while (index < files.length) {
      const i = index++;
      const file = files[i];
      console.log(`[Batch] Procesando ${i + 1}/${files.length}: "${file.name}"`);
      const result = await analyzeSingleFile(file);
      results.push(result);
      if (onProgress) onProgress(i + 1, files.length, result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => worker());
  await Promise.all(workers);

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`[Batch] Completado: ${succeeded} exitosos, ${failed} fallidos de ${files.length} totales`);
  return { total: files.length, succeeded, failed, results };
}
