export interface TrackPoint {
  t: number;
  lat: number;
  lon: number;
  altFt: number | null;
  ground: boolean;
  gsKt: number;
  trk: number;
  cs: string | null;
}

export interface RawTrack {
  id: string;
  reg: string | null;
  type: string | null;
  category: string | null;
  points: TrackPoint[];
}

export interface SimplifyOptions {
  minSpacingS: number;
  horizM: number;
  vertFt: number;
}

export const DEFAULT_SIMPLIFY: SimplifyOptions = { minSpacingS: 20, horizM: 150, vertFt: 100 };

export interface AirportEnd {
  ap: string | null;
  t: number;
  conf: 'ground' | 'inferred' | 'unknown';
}

export interface FlightRecord {
  id: string;
  icao24: string;
  cs: string | null;
  r: string | null;
  ty: string | null;
  al: string | null;
  dep: AirportEnd;
  arr: AirportEnd;
  km: number;
  maxAltFt: number;
  hours: number[];
}

export interface CatalogHour {
  h: number;
  file: string;
  bytes: number;
  aircraft: number;
}

export interface CatalogDay {
  date: string;
  source: string;
  attribution: string;
  featured: boolean;
  hours: CatalogHour[];
  flightsFile: string;
}

export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  days: CatalogDay[];
  airportsFile: string;
  airlinesFile: string;
  timezonesFile: string;
}
