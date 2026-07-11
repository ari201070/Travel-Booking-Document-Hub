import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DB_PATH = path.join(process.cwd(), "document_anchors.db");

let db: SqlJsDatabase | null = null;

export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log(`[DB] Base de datos existente cargada (${buffer.length} bytes)`);
  } else {
    db = new SQL.Database();
    console.log("[DB] Nueva base de datos creada");
  }

  db.run("PRAGMA journal_mode=WAL");

  db.run(`
    CREATE TABLE IF NOT EXISTS document_anchors (
      id TEXT PRIMARY KEY,
      processed_at TEXT DEFAULT (datetime('now')),
      location TEXT,
      latitude REAL,
      longitude REAL,
      is_travel_document INTEGER DEFAULT 0,
      h3_index TEXT,
      raw_json TEXT
    )
  `);

  try {
    db.run("ALTER TABLE document_anchors ADD COLUMN h3_index TEXT");
  } catch {
    // La columna ya existe en bases de datos más nuevas
  }

  persist();
  console.log("[DB] Tabla 'document_anchors' lista (con h3_index)");
  return db;
}

function persist(): void {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error("[DB] Error al persistir en disco:", err);
  }
}

export function generateAnchorId(name: string): string {
  const hash = crypto.createHash("sha256").update(name + Date.now() + Math.random()).digest("hex").slice(0, 16);
  return `doc_${hash}`;
}

export function insertAnchor(record: {
  id: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_travel_document: boolean;
  h3_index?: string | null;
  raw_json: string;
}): void {
  if (!db) {
    console.warn("[DB] Base de datos no inicializada — omitiendo inserción");
    return;
  }

  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO document_anchors (id, location, latitude, longitude, is_travel_document, h3_index, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      record.id,
      record.location || null,
      record.latitude ?? null,
      record.longitude ?? null,
      record.is_travel_document ? 1 : 0,
      record.h3_index || null,
      record.raw_json,
    ]);
    stmt.free();
    persist();
  } catch (err) {
    console.error("[DB] Error insertando anchor:", err);
  }
}

export function findAnchorByLocation(location: string): {
  latitude: number;
  longitude: number;
  h3_index: string | null;
} | null {
  if (!db) return null;
  try {
    const row = db.prepare(`
      SELECT latitude, longitude, h3_index FROM document_anchors
      WHERE location = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND processed_at > datetime('now', '-15 minutes')
      ORDER BY processed_at DESC LIMIT 1
    `).get([location]) as { latitude: number; longitude: number; h3_index: string | null } | undefined;
    return row || null;
  } catch {
    return null;
  }
}

export function findAnchorsByH3(h3Index: string): {
  location: string;
  latitude: number;
  longitude: number;
} | null {
  if (!db) return null;
  try {
    const rows = db.prepare(`
      SELECT location, latitude, longitude FROM document_anchors
      WHERE h3_index = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND processed_at > datetime('now', '-15 minutes')
      ORDER BY processed_at DESC LIMIT 1
    `).get([h3Index]) as { location: string; latitude: number; longitude: number } | undefined;
    return rows || null;
  } catch {
    return null;
  }
}

export function getDb(): SqlJsDatabase | null {
  return db;
}
