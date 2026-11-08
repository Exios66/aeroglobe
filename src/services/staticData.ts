import { decodeSamples, type HourChunk } from '../../shared/trackCodec';
import type { Flight, FlightDetail } from '../types/flight';

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

const MAX_CACHED_FILES = 24;
const fileCache = new Map<string, { expires: number; value: Promise<unknown> }>();

export function clearStaticDataCache(): void {
  fileCache.clear();
}

async function fetchJson<T>(base: string, file: string, revision = ''): Promise<T> {
  const key = `${base}${file}:${revision}`;
  const cached = fileCache.get(key);
  if (cached && cached.expires > Date.now()) {
    fileCache.delete(key);
    fileCache.set(key, cached);
    return cached.value as Promise<T>;
  }
  const value = (async () => {
    const response = await fetch(`${base}${file}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${file} request failed with status ${response.status}`);
    return await response.json() as T;
  })();
  fileCache.set(key, { expires: Date.now() + (file === 'catalog.json' ? 60_000 : 15 * 60_000), value });
  while (fileCache.size > MAX_CACHED_FILES) fileCache.delete(fileCache.keys().next().value!);
  try {
    return await value;
  } catch (error) {
    if (fileCache.get(key)?.value === value) fileCache.delete(key);
    throw error;
  }
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

/** Twenty-four aircraft counts, using zero when the catalog omits an hour. */
export function hourCounts(hours: { h: number; aircraft: number }[]): number[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const hour of hours) {
    if (hour.h >= 0 && hour.h < 24) counts[hour.h] = hour.aircraft;
  }
  return counts;
}

/** The requested populated hour, or the latest populated hour when that request is missing or empty. */
export function selectHour(
  day: CatalogDay,
  requested: number | null | undefined,
): CatalogDay['hours'][number] | null {
  if (requested != null) {
    const match = day.hours.find((hour) => hour.h === requested && hour.aircraft > 0);
    if (match) return match;
  }
  return latestHour(day);
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
export async function fetchChunkStates(base: string, file: string, revision = ''): Promise<Flight[]> {
  const chunk = await fetchJson<HourChunk>(base, file, revision);
  const states: Flight[] = [];
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
      baroAltitude: p.altFt === null ? null : p.altFt / 3.28084,
      velocity: p.gsKt * 0.514444,
      trueTrack: p.trk,
      onGround: p.altFt === null,
      lastContact: p.t,
      track: points
        .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat))
        .map((point) => ({
          longitude: point.lon,
          latitude: point.lat,
          altitude: point.altFt === null ? 0 : point.altFt / 3.28084,
          timestamp: point.t,
        })),
    });
  }
  return states;
}

/** Fetches the per-day flights index. */
export async function fetchFlightsIndex(base: string, file: string, revision = ''): Promise<FlightRecord[]> {
  const body = await fetchJson<{ v: number; flights: FlightRecord[] }>(base, file, revision);
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
    originIcao: record.dep.ap ?? undefined,
    originCoordinates: dep ? [dep[6], dep[5]] : undefined,
    originTz: dep?.[8] ?? undefined,
    destinationIata: arr?.[1] ?? record.arr.ap ?? '—',
    destinationCity: arr?.[3] ?? 'Unknown',
    destinationIcao: record.arr.ap ?? undefined,
    destinationCoordinates: arr ? [arr[6], arr[5]] : undefined,
    destinationTz: arr?.[8] ?? undefined,
    departureTime: new Date(record.dep.t * 1000).toISOString(),
    arrivalTime: new Date(record.arr.t * 1000).toISOString(),
    status: 'active',
    aircraftType: record.ty ?? '',
    registration: record.r ?? '',
    recordId: record.id,
    routeCoordinates: dep && arr ? [
      [dep[6], dep[5]],
      [arr[6], arr[5]],
    ] : [],
  };
}

/**
 * Loads one day's aircraft with real details attached: the requested populated hour, or the newest
 * one, plus the day's flights index and the airport and airline references. Flights without an
 * index entry keep their snapshot data and a placeholder route.
 *
 * A failing hour chunk does not fail the whole load: the next populated hour is tried, and the
 * failed hours come back in `unavailableHours` so the timeline can mark them as unavailable
 * (spec §7 — never fabricate positions for a missing hour).
 */
export async function loadLatestStates(
  base: string,
  requestedDay?: string | null,
  requestedHour?: number | null,
): Promise<{
  states: Flight[];
  day: CatalogDay;
  hour: CatalogDay['hours'][number];
  flights: number;
  records: FlightRecord[];
  airports: Map<string, AirportRow>;
  airlines: Map<string, AirlineRow>;
  unavailableHours: number[];
  days: CatalogDay[];
}> {
  const catalog = await fetchCatalog(base);
  const day = requestedDay ? catalog.days.find((candidate) => candidate.date === requestedDay) ?? null : latestDay(catalog);
  const selected = day ? selectHour(day, requestedHour) : null;
  if (!day || !selected) throw new Error('the data catalog has no hours to load');

  // Try the selected hour first, then every other populated hour, newest first.
  const populated = day.hours.filter((candidate) => candidate.aircraft > 0);
  const candidates = [
    selected,
    ...populated.filter((candidate) => candidate.h !== selected.h).sort((a, b) => b.h - a.h),
    latestHour(day) !== null ? day.hours.filter((h) => !populated.includes(h)).sort((a, b) => b.h - a.h) : [],
  ].flat();

  const [records, airportRows, airlineRows] = await Promise.all([
    fetchFlightsIndex(base, day.flightsFile, catalog.generatedAt).catch(() => [] as FlightRecord[]),
    fetchJson<AirportRow[]>(base, catalog.airportsFile, catalog.generatedAt).catch(() => [] as AirportRow[]),
    fetchJson<AirlineRow[]>(base, catalog.airlinesFile, catalog.generatedAt).catch(() => [] as AirlineRow[]),
  ]);

  const unavailableHours: number[] = [];
  let states: Flight[] | null = null;
  let hour: CatalogDay['hours'][number] | null = null;
  for (const candidate of candidates) {
    if (unavailableHours.includes(candidate.h)) continue;
    try {
      states = await fetchChunkStates(base, candidate.file, catalog.generatedAt);
      hour = candidate;
      break;
    } catch {
      unavailableHours.push(candidate.h);
    }
  }
  if (!states || !hour) {
    throw new Error('no hour chunks could be loaded from the data directory');
  }

  const airports = new Map(airportRows.map((row) => [row[0], row]));
  const airlines = new Map(airlineRows.map((row) => [row[0], row]));
  const byIcao = new Map(records.map((record) => [record.icao24, record]));

  const enriched: Flight[] = states.map((state) => {
    const record = byIcao.get(state.icao24);
    return record ? { ...state, detail: buildFlightDetail(record, day, airports, airlines) } : state;
  });
  return {
    states: enriched,
    day,
    hour,
    flights: records.length,
    records,
    airports,
    airlines,
    unavailableHours,
    days: [...catalog.days].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
