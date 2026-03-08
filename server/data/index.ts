/**
 * Data layer: organized by airline operator and airport of departure.
 *
 * - shared/         – airport coordinates, shared across operators
 * - operators/      – per-operator, per-airport data (e.g. southwest/ord/, southwest/las/)
 * - mockFlights.ts  – generic mock when no operator fallback is available
 */

export {
  getDestinationCoords,
  ORD_COORDS,
  AIRPORT_COORDS,
} from './shared/airportCoords';

export {
  getMockAircraftStates,
  getMockFlightDetail,
  searchMockFlights,
} from './mockFlights';

export {
  getSouthwestOrdFallbackStates,
  getSouthwestOrdFlightDetail,
  getSouthwestLasFallbackStates,
  getSouthwestLasFlightDetail,
} from './operators/southwest';

import type { AircraftState, FlightDetail } from '../../src/types/flight';
import {
  getSouthwestOrdFallbackStates,
  getSouthwestOrdFlightDetail,
  getSouthwestLasFallbackStates,
  getSouthwestLasFlightDetail,
} from './operators/southwest';
import {
  getFrontierOrdFallbackStates,
  getFrontierOrdFlightDetail,
} from './operators/frontier';

/** All airport departure datasets: ORD, LAS, Frontier, etc. Each returns states or []. */
const FALLBACK_STATE_PROVIDERS = [
  getSouthwestOrdFallbackStates,
  getSouthwestLasFallbackStates,
  getFrontierOrdFallbackStates,
];

/** All airport detail lookups. Each returns detail or null. */
const FALLBACK_DETAIL_PROVIDERS: ((icao24: string) => FlightDetail | null)[] = [
  getSouthwestOrdFlightDetail,
  getSouthwestLasFlightDetail,
  getFrontierOrdFlightDetail,
];

/** Merged historical states from all included airport departure data. */
export async function getAllFallbackStates(): Promise<AircraftState[]> {
  const results = await Promise.all(
    FALLBACK_STATE_PROVIDERS.map((fn) => fn().catch(() => [] as AircraftState[])),
  );
  return results.flat();
}

/** Resolve flight detail from any included airport fallback dataset. */
export function getFallbackFlightDetail(icao24: string): FlightDetail | null {
  for (const getDetail of FALLBACK_DETAIL_PROVIDERS) {
    const detail = getDetail(icao24);
    if (detail) return detail;
  }
  return null;
}
