/**
 * Southwest Airlines fallback data.
 * Organized by departure airport: ord/ (Chicago O'Hare), las/ (Las Vegas), etc.
 */
import { getOrdFallbackStates, getOrdFlightDetail } from './ord/parser';
import { getLasFallbackStates, getLasFlightDetail } from './las/parser';

export async function getSouthwestOrdFallbackStates() {
  return getOrdFallbackStates();
}

export function getSouthwestOrdFlightDetail(icao24: string) {
  return getOrdFlightDetail(icao24);
}

export async function getSouthwestLasFallbackStates() {
  return getLasFallbackStates();
}

export function getSouthwestLasFlightDetail(icao24: string) {
  return getLasFlightDetail(icao24);
}
