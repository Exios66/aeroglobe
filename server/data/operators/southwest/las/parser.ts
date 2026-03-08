import type { AircraftState, FlightDetail } from '../../../../../src/types/flight';

/**
 * Southwest LAS fallback states. Stub until shared/departureCsvParser and CSV wiring exist.
 */
export async function getSouthwestLasFallbackStates(): Promise<AircraftState[]> {
  return [];
}

/**
 * Southwest LAS flight detail by icao24. Stub until shared/departureCsvParser and CSV wiring exist.
 */
export function getSouthwestLasFlightDetail(_icao24: string): FlightDetail | null {
  return null;
}
