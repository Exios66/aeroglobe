import type { AircraftState } from '../../src/types/flight';
import { getMockAircraftStates, getAllFallbackStates } from '../data';

type OpenSkyStateArray = [
  string | null,
  string | null,
  string | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  boolean | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  string | null,
  boolean | null,
  number | null,
];

type OpenSkyResponse = {
  time: number;
  states: OpenSkyStateArray[] | null;
};

type FetchFlightsOptions = {
  bbox?: [number, number, number, number];
  time?: number;
};

function mapOpenSkyState(row: OpenSkyStateArray): AircraftState | null {
  const [
    icao24,
    callsign,
    originCountry,
    _timePosition,
    lastContact,
    longitude,
    latitude,
    baroAltitude,
    onGround,
    velocity,
    trueTrack,
  ] = row;

  if (!icao24 || longitude == null || latitude == null || !originCountry || lastContact == null) {
    return null;
  }

  return {
    icao24,
    callsign: callsign?.trim() || null,
    originCountry,
    longitude,
    latitude,
    baroAltitude,
    velocity,
    trueTrack,
    onGround: Boolean(onGround),
    lastContact,
  };
}

function buildUrl({ bbox, time }: FetchFlightsOptions): string {
  const url = new URL('https://opensky-network.org/api/states/all');
  if (bbox) {
    const [lamin, lomin, lamax, lomax] = bbox;
    url.searchParams.set('lamin', String(lamin));
    url.searchParams.set('lomin', String(lomin));
    url.searchParams.set('lamax', String(lamax));
    url.searchParams.set('lomax', String(lomax));
  }

  if (time) {
    url.searchParams.set('time', String(time));
  }

  return url.toString();
}

function getAuthHeader(): string | null {
  const user = process.env.OPENSKY_USER;
  const pass = process.env.OPENSKY_PASS;
  if (!user || !pass) {
    return null;
  }

  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

export async function fetchLiveAircraftStates(
  options: FetchFlightsOptions = {},
): Promise<{ flights: AircraftState[]; source: 'opensky' | 'mock' | 'historical'; stale: boolean }> {
  try {
    const headers: Record<string, string> = {};
    const authHeader = getAuthHeader();
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const response = await fetch(buildUrl(options), { headers });
    if (!response.ok) {
      throw new Error(`OpenSky request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenSkyResponse;
    const flights = (payload.states ?? [])
      .map(mapOpenSkyState)
      .filter((flight): flight is AircraftState => Boolean(flight));

    if (flights.length === 0) {
      const historical = await getAllFallbackStates();
      if (historical.length > 0) {
        return { flights: historical, source: 'historical', stale: true };
      }
      return {
        flights: getMockAircraftStates(),
        source: 'mock',
        stale: true,
      };
    }

    return {
      flights,
      source: 'opensky',
      stale: false,
    };
  } catch {
    const historical = await getAllFallbackStates();
    if (historical.length > 0) {
      return { flights: historical, source: 'historical', stale: true };
    }
    return {
      flights: getMockAircraftStates(),
      source: 'mock',
      stale: true,
    };
  }
}
