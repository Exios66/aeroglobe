import { decodeSamples, type HourChunk } from '../../shared/trackCodec';
import type { AircraftState, Flight, FlightDetail } from '../types/flight';

export interface CatalogDay {
  date: string;
  source: string;
  attribution: string;
  featured: boolean;
  hours: { h: number; file: string; bytes: number; aircraft: number }[];
  flightsFile: string;
}

export interface Catalog {
  schemaVersion: number;
  generatedAt: string;
  days: CatalogDay[];
  airportsFile: string;
  airlinesFile: string;
  timezonesFile: string;
}

/** Pipeline flight record (spec §5.3). */
export interface FlightRecord {
  id: string;
  icao24: string;
  cs: string | null;
  r: string | null;
  ty: string | null;
  al: string | null;
  dep: { ap: string | null; t: number; conf: string };
  arr: { ap: string | null; t: number; conf: string };
  km: number;
  maxAltFt: number;
  hours: number[];
}

/** Compact airport row from `ref/airports.json`: [icao, iata, name, city, country, lat, lon, elevFt, tz]. */
export type AirportRow = [string, string | null, string, string, string, number, number, number, string | null];

/** Compact airline row from `ref/airlines.json`: [icao, iata, name, callsignPrefix]. */
export type AirlineRow = [string, string | null, string, string | null];

/**
 * Resolves the data directory from `VITE_DATA_BASE_URL`, defaulting to `data/` under the
 * app's base path so both Pages (`/aeroglobe/data/`) and Vercel (`/data/`) work.
 */
export function dataBaseUrl(env: { VITE_DATA_BASE_URL?: string; BASE_URL: string }): string {
  const explicit = env.VITE_DATA_BASE_URL?.trim();
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;
  return `${env.BASE_URL}data/`;
}

async function fetchJson<T>(base: string, file: string): Promise<T> {
  const response = await fetch(`${base}${file}`);
  if (!response.ok) throw new Error(`${file} request failed with status ${response.status}`);
  return (await response.json()) as T;
}

/** Fetches and validates the catalog. @throws {Error} On a non-OK response or missing days. */
export async function fetchCatalog(base: string): Promise<Catalog> {
  const catalog = await fetchJson<Catalog>(base, 'catalog.json');
  if (!Array.isArray(catalog.days)) throw new Error('catalog.json has no days array');
  return catalog;
}

/** The day with the greatest date; null when the catalog has no days. */
export function latestDay(catalog: Catalog): CatalogDay | null {
  let best: CatalogDay | null = null;
  for (const day of catalog.days) if (!best || day.date > best.date) best = day;
  return best;
}

/** Returns the hour entry with the greatest index among those with aircraft, or overall if none have; null for no hours. */
export function latestHour(day: CatalogDay): CatalogDay['hours'][number] | null {
  let best: CatalogDay['hours'][number] | null = null;
  let bestAny: CatalogDay['hours'][number] | null = null;
  for (const hour of day.hours) {
    if (!bestAny || hour.h > bestAny.h) bestAny = hour;
    if (hour.aircraft > 0 && (!best || hour.h > best.h)) best = hour;
  }
  return best ?? bestAny;
}

/**
 * Decodes every aircraft's last sample in one hour chunk into an AircraftState. Callsign,
 * registration, and type are carried; ground rows keep a null baroAltitude. Entries whose
 * last sample does not decode to a finite position are skipped.
 */
export async function fetchChunkStates(base: string, file: string): Promise<AircraftState[]> {
  const chunk = await fetchJson<HourChunk>(base, file);
  const states: AircraftState[] = [];
  for (const entry of chunk.a ?? []) {
    const points = decodeSamples(entry.p, chunk.t0);
    if (points.length === 0) continue;
    const p = points[points.length - 1];
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    states.push({
      icao24: entry.id,
      callsign: entry.cs,
      originCountry: '',
      longitude: p.lon,
      latitude: p.lat,
      baroAltitude: p.altFt,
      velocity: p.gsKt * 0.514444,
      trueTrack: p.trk,
      onGround: p.altFt === null,
      lastContact: p.t,
    });
  }
  return states;
}

/** Fetches the per-day flights index. */
export async function fetchFlightsIndex(base: string, file: string): Promise<FlightRecord[]> {
  const body = await fetchJson<{ v: number; flights: FlightRecord[] }>(base, file);
  return body.flights ?? [];
}

function statValue(value: string | number | null | undefined, fallback: string): string {
  return value === null || value === undefined || value === '' ? fallback : String(value);
}

/** Builds the FlightCard detail for one indexed flight, resolving airports and the airline from the reference rows. */
export function buildFlightDetail(
  record: FlightRecord,
  day: CatalogDay,
  airports: Map<string, AirportRow>,
  airlines: Map<string, AirlineRow>,
): FlightDetail {
  const dep = record.dep.ap ? airports.get(record.dep.ap) : undefined;
  const arr = record.arr.ap ? airports.get(record.arr.ap) : undefined;
  const prefix = record.cs?.slice(0, 3) ?? '';
  const airline = record.al ? airlines.get(record.al) : undefined;
  const flightNumber = record.cs?.trim() || (airline?.[1] && prefix ? `${airline[1]}${record.cs?.slice(3)}` : '');
  return {
    flightNumber: statValue(flightNumber, record.icao24.toUpperCase()),
    airline: airline?.[2] ?? 'Unknown airline',
    airlineIata: airline?.[1] ?? prefix,
    originIata: dep?.[1] ?? record.dep.ap ?? '—',
    originCity: dep?.[3] ?? 'Unknown',
    originCoordinates: dep ? [dep[6], dep[5]] : undefined,
    destinationIata: arr?.[1] ?? record.arr.ap ?? '—',
    destinationCity: arr?.[3] ?? 'Unknown',
    destinationCoordinates: arr ? [arr[6], arr[5]] : undefined,
    departureTime: new Date(record.dep.t * 1000).toISOString(),
    arrivalTime: new Date(record.arr.t * 1000).toISOString(),
    status: 'active',
    aircraftType: record.ty ?? '',
    registration: record.r ?? '',
    routeCoordinates: dep && arr ? [
      [dep[6], dep[5]],
      [arr[6], arr[5]],
    ] : [],
  };
}

/**
 * Loads the latest day's aircraft with real details attached: the newest hour chunk, the day's
 * flights index, and the airport and airline references. Flights without an index entry keep
 * their snapshot data and a placeholder route.
 */
export async function loadLatestStates(
  base: string,
): Promise<{ states: Flight[]; day: CatalogDay; flights: number }> {
  const catalog = await fetchCatalog(base);
  const day = latestDay(catalog);
  const hour = day ? latestHour(day) : null;
  if (!day || !hour) throw new Error('the data catalog has no hours to load');

  const [states, records, airportRows, airlineRows] = await Promise.all([
    fetchChunkStates(base, hour.file),
    fetchFlightsIndex(base, day.flightsFile).catch(() => [] as FlightRecord[]),
    fetchJson<AirportRow[]>(base, catalog.airportsFile).catch(() => [] as AirportRow[]),
    fetchJson<AirlineRow[]>(base, catalog.airlinesFile).catch(() => [] as AirlineRow[]),
  ]);

  const airports = new Map(airportRows.map((row) => [row[0], row]));
  const airlines = new Map(airlineRows.map((row) => [row[0], row]));
  const byIcao = new Map(records.map((record) => [record.icao24, record]));

  const enriched: Flight[] = states.map((state) => {
    const record = byIcao.get(state.icao24);
    return record ? { ...state, detail: buildFlightDetail(record, day, airports, airlines) } : state;
  });
  return { states: enriched, day, flights: records.length };
}
