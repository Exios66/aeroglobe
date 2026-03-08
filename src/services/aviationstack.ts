import type { FlightDetail } from '../types/flight';
import { memoryCache } from './cache';
import { fetchFlightDetailRequest } from './api';

const DETAIL_CACHE_TTL_MS = 60 * 60 * 1000;

export async function fetchFlightDetail(
  icao24: string,
  callsign?: string | null,
): Promise<FlightDetail | null> {
  const cacheKey = `detail:${icao24}:${callsign ?? 'none'}`;
  const cached = memoryCache.get<FlightDetail>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetchFlightDetailRequest(icao24, callsign);
    memoryCache.set(cacheKey, response.detail, DETAIL_CACHE_TTL_MS);
    return response.detail;
  } catch {
    return null;
  }
}
