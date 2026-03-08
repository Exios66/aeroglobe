import path from 'path';
import { fileURLToPath } from 'url';
import type { AircraftState, FlightDetail } from '../../../../../src/types/flight';
import { LAS_COORDS } from '../../../shared/airportCoords';
import {
  parseDeparturesCsv,
  rowToState,
  rowToDetail,
  type DepartureRow,
} from '../../../shared/departureCsvParser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPARTURES_CSV = path.join(__dirname, 'departures.csv');

const MAX_ROWS = 120;
const CACHE_TTL_MS = 60_000;
const ORIGIN = { coords: LAS_COORDS, iata: 'LAS', city: 'Las Vegas Harry Reid' };
const AIRLINE = { iata: 'WN', name: 'Southwest Airlines', callsignPrefix: 'WN' };
const ICAO_PREFIX = '02';

let cache: {
  states: AircraftState[];
  rowByIcao: Map<string, DepartureRow>;
  at: number;
} | null = null;

export async function getLasFallbackStates(): Promise<AircraftState[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.states;
  try {
    const rows = await parseDeparturesCsv(DEPARTURES_CSV);
    const valid = rows.filter((r) => r.carrierCode === 'WN' && r.destinationIata);
    const slice = valid.slice(-MAX_ROWS);
    const rowByIcao = new Map<string, DepartureRow>();
    const states = slice
      .map((row, i) => {
        const state = rowToState(row, i, ORIGIN, AIRLINE, ICAO_PREFIX);
        if (state) rowByIcao.set(state.icao24.toLowerCase(), row);
        return state;
      })
      .filter((s): s is AircraftState => s != null);
    cache = { states, rowByIcao, at: Date.now() };
    return states;
  } catch {
    return [];
  }
}

export function getLasFlightDetail(icao24: string): FlightDetail | null {
  if (!cache) return null;
  const row = cache.rowByIcao.get(icao24.toLowerCase());
  return row ? rowToDetail(row, ORIGIN, AIRLINE) : null;
}
