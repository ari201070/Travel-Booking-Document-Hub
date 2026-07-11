import { latLngToCell } from "h3-js";
import { findAnchorByLocation, findAnchorsByH3 } from "./db.js";

const H3_RESOLUTION = 9;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

type CacheEntry = {
  location: string;
  latitude: number;
  longitude: number;
};

const memoryCache = new Map<string, { entry: CacheEntry; timestamp: number }>();

export function getH3Index(lat: number, lng: number, resolution: number = H3_RESOLUTION): string {
  return latLngToCell(lat, lng, resolution);
}

export function checkSpatialCache(h3Index: string): CacheEntry | null {
  const mem = memoryCache.get(h3Index);
  if (mem && Date.now() - mem.timestamp < FIFTEEN_MIN_MS) {
    return mem.entry;
  }
  if (mem) memoryCache.delete(h3Index);

  const dbResult = findAnchorsByH3(h3Index);
  if (dbResult) {
    memoryCache.set(h3Index, { entry: dbResult, timestamp: Date.now() });
    return dbResult;
  }

  return null;
}

export function checkLocationCache(location: string): CacheEntry | null {
  const dbResult = findAnchorByLocation(location);
  if (dbResult && dbResult.h3_index) {
    const entry: CacheEntry = {
      location,
      latitude: dbResult.latitude,
      longitude: dbResult.longitude,
    };
    memoryCache.set(dbResult.h3_index, { entry, timestamp: Date.now() });
    return entry;
  }
  return null;
}

export function updateSpatialCache(h3Index: string, location: string, lat: number, lng: number): void {
  memoryCache.set(h3Index, {
    entry: { location, latitude: lat, longitude: lng },
    timestamp: Date.now(),
  });
}
