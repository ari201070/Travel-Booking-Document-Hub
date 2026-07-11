import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

function sanitizeKey(key: string): string {
  if (!key) return "";
  return key.trim().replace(/^["']|["']$/g, "").trim();
}

let apiKey = "";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    if (envConfig.GEMINI_API_KEY && envConfig.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && envConfig.GEMINI_API_KEY.trim() !== "") {
      apiKey = sanitizeKey(envConfig.GEMINI_API_KEY);
      process.env.GEMINI_API_KEY = apiKey;
    }
  } catch {
    // ignore
  }
}

if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
  const exampleEnvPath = path.join(process.cwd(), ".env.example");
  if (fs.existsSync(exampleEnvPath)) {
    try {
      const exampleConfig = dotenv.parse(fs.readFileSync(exampleEnvPath));
      if (exampleConfig.GEMINI_API_KEY && exampleConfig.GEMINI_API_KEY !== "MY_GEMINI_API_KEY" && exampleConfig.GEMINI_API_KEY.trim() !== "") {
        apiKey = sanitizeKey(exampleConfig.GEMINI_API_KEY);
        process.env.GEMINI_API_KEY = apiKey;
      }
    } catch {
      // ignore
    }
  }
}

if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
  apiKey = sanitizeKey(process.env.GEMINI_API_KEY || "");
}

if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined. Gemini features will fail.");
} else {
  const masked = apiKey.length > 8 ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "SHORT_KEY";
  console.log(`Loaded GEMINI_API_KEY: ${masked}`);
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const ai = new GoogleGenAI({
  apiKey: apiKey || "",
  httpOptions: {
    headers: { "User-Agent": "aistudio-build" },
  },
});

export async function generateContentWithRetry(options: any, maxRetries = 3, initialDelayMs = 2500): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await ai.models.generateContent(options);
    } catch (error: any) {
      attempt++;
      const errorString = JSON.stringify(error) || "";
      const errorMessage = error.message || "";
      const isRateLimit =
        error.status === "RESOURCE_EXHAUSTED" ||
        error.statusCode === 429 ||
        error.status === 429 ||
        errorMessage.includes("429") ||
        errorMessage.includes("RESOURCE_EXHAUSTED") ||
        errorMessage.includes("Quota exceeded") ||
        errorMessage.includes("rate-limits") ||
        errorString.includes("429") ||
        errorString.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt <= maxRetries) {
        const delay = initialDelayMs * Math.pow(2.2, attempt - 1) + Math.random() * 1000;
        console.warn(`[Gemini] Rate limit. Retry ${attempt}/${maxRetries} in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

export function formatGeminiError(error: any): { error: string; details: string; code?: string } {
  const errorString = error?.message || String(error || "");
  let parsedMsg = errorString;
  let isQuotaExceeded = false;

  try {
    if (errorString.startsWith("{") || errorString.includes('"error"')) {
      const startIdx = errorString.indexOf("{");
      const parsed = JSON.parse(errorString.substring(startIdx));
      if (parsed.error && parsed.error.message) {
        parsedMsg = parsed.error.message;
      }
    }
  } catch {
    // ignore
  }

  if (
    error?.status === "RESOURCE_EXHAUSTED" ||
    error?.statusCode === 429 ||
    error?.status === 429 ||
    parsedMsg.includes("429") ||
    parsedMsg.includes("quota") ||
    parsedMsg.includes("Quota exceeded") ||
    parsedMsg.includes("RESOURCE_EXHAUSTED") ||
    parsedMsg.includes("limit") ||
    parsedMsg.includes("rate-limits")
  ) {
    isQuotaExceeded = true;
  }

  if (isQuotaExceeded) {
    return {
      error: "Límite de cuota de IA alcanzado (429)",
      details:
        "Has alcanzado la cuota de consultas gratuitas de la API de Gemini (20 solicitudes diarias). Para continuar analizando documentos, por favor añade una clave API de Gemini en la configuración de la aplicación.",
      code: "QUOTA_EXCEEDED",
    };
  }

  return {
    error: "Error en el análisis de documento",
    details: parsedMsg || "Ocurrió un error inesperado al procesar el archivo con el modelo Gemini.",
  };
}
