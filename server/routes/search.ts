import { Router } from 'express';
import type { FlightSearchResult } from '../../src/types/flight';
import { searchMockFlights } from '../data';
import { serverCache } from '../middleware/cache';
import { fetchLiveAircraftStates } from '../services/opensky';

const SEARCH_CACHE_SECONDS = 10;

function rankResults(query: string, results: FlightSearchResult[]): FlightSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();

  return [...results].sort((left, right) => {
    const leftText = `${left.flightNumber} ${left.callsign ?? ''} ${left.airline} ${left.route}`.toLowerCase();
    const rightText = `${right.flightNumber} ${right.callsign ?? ''} ${right.airline} ${right.route}`.toLowerCase();

    const leftStarts = leftText.startsWith(normalizedQuery) ? 1 : 0;
    const rightStarts = rightText.startsWith(normalizedQuery) ? 1 : 0;

    return rightStarts - leftStarts;
  });
}

export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    res.json({ results: [], source: 'empty' });
    return;
  }

  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = serverCache.get<{ results: FlightSearchResult[]; source: string }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const livePayload = await fetchLiveAircraftStates();
  const liveResults = livePayload.flights.flatMap<FlightSearchResult>((flight) => {
    const callsign = flight.callsign?.trim();
    const airline = callsign?.slice(0, 3) || flight.originCountry;
    const route = `${flight.originCountry} airspace`;
    const haystack = `${callsign ?? ''} ${airline} ${route}`.toLowerCase();

    if (!haystack.includes(query.toLowerCase())) {
      return [];
    }

    return [
      {
        icao24: flight.icao24,
        callsign: callsign || null,
        airline,
        flightNumber: callsign || flight.icao24.toUpperCase(),
        route,
        status: flight.onGround ? 'landed' : 'active',
      },
    ];
  });

  const merged = rankResults(query, [...liveResults, ...searchMockFlights(query)]).slice(0, 8);
  const responseBody = {
    results: merged,
    source: livePayload.source,
  };

  serverCache.set(cacheKey, responseBody, SEARCH_CACHE_SECONDS);
  res.json(responseBody);
});
