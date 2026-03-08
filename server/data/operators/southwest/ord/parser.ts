import type { AircraftState, FlightDetail } from '../../../../../src/types/flight';

/**
 * Southwest ORD fallback states. Stub until shared/departureCsvParser and CSV wiring exist.
 */
export async function getSouthwestOrdFallbackStates(): Promise<AircraftState[]> {
  return [];
}

/**
 * Southwest ORD flight detail by icao24. Stub until shared/departureCsvParser and CSV wiring exist.
 */
export function getSouthwestOrdFlightDetail(_icao24: string): FlightDetail | null {
  return null;
}
