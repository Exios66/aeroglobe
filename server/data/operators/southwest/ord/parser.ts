import path from 'path';
import { fileURLToPath } from 'url';
import type { AircraftState, FlightDetail } from '../../../../../src/types/flight';
import { ORD_COORDS } from '../../../shared/airportCoords';
import {
  parseDeparturesCsv,
  rowToState,
  rowToDetail,
  type DepartureRow,
} from '../../../shared/departureCsvParser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPARTURES_CSV = path.join(__dirname, 'Detailed_Statistics_Departures.csv');

const MAX_ROWS = 120;
const CACHE_TTL_MS = 60_000;
const ORIGIN = { coords: ORD_COORDS, iata: 'ORD', city: 'Chicago O\'Hare' };
const AIRLINE = { iata: 'WN', name: 'Southwest Airlines', callsignPrefix: 'WN' };
const ICAO_PREFIX = 'a1';

let cache: {
  states: AircraftState[];
  rowByIcao: Map<string, DepartureRow>;
  at: number;
} | null = null;

export async function getSouthwestOrdFallbackStates(): Promise<AircraftState[]> {
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

export function getSouthwestOrdFlightDetail(icao24: string): FlightDetail | null {
  if (!cache) return null;
  const row = cache.rowByIcao.get(icao24.toLowerCase());
  return row ? rowToDetail(row, ORIGIN, AIRLINE) : null;
}
