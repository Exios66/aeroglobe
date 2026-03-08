import type { AircraftState, FlightDetail, FlightSearchResult } from '../types/flight';

export type LiveFlightsResponse = {
  flights: AircraftState[];
  source: 'opensky' | 'mock' | 'historical';
  stale: boolean;
  fetchedAt: string;
};

export type SearchResponse = {
  results: FlightSearchResult[];
  source: string;
};

export type FlightDetailResponse = {
  detail: FlightDetail;
  source: string;
  fetchedAt: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function toAbsoluteUrl(path: string): string {
  if (!API_BASE_URL) {
    return path;
  }

  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(toAbsoluteUrl(path));
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function fetchLiveFlights(playbackTime?: Date | null): Promise<LiveFlightsResponse> {
  const searchParams = new URLSearchParams();
  if (playbackTime) {
    searchParams.set('time', String(Math.floor(playbackTime.getTime() / 1000)));
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return requestJson<LiveFlightsResponse>(`/api/flights/live${suffix}`);
}

export function searchFlights(query: string): Promise<SearchResponse> {
  return requestJson<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`);
}

export function fetchFlightDetailRequest(
  icao24: string,
  callsign?: string | null,
): Promise<FlightDetailResponse> {
  const searchParams = new URLSearchParams();
  if (callsign?.trim()) {
    searchParams.set('callsign', callsign.trim());
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  return requestJson<FlightDetailResponse>(`/api/flights/${icao24}/detail${suffix}`);
}
