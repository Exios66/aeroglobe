import { Router } from 'express';
import { serverCache } from '../middleware/cache';
import { resolveFlightDetail } from '../services/flightDetails';
import { fetchLiveAircraftStates } from '../services/opensky';

const FLIGHT_CACHE_SECONDS = 15;
const DETAIL_CACHE_SECONDS = 60 * 60;

export type BboxParseResult =
  | { status: 'absent' }
  | { status: 'valid'; bbox: [number, number, number, number] }
  | { status: 'invalid' };

/**
 * Validates a `bbox=lon1,lat1,lon2,lat2` query value. Four finite numbers within
 * their geographic ranges with min <= max, or absent; anything else is invalid so
 * the route can answer 400 instead of silently searching the whole planet.
 */
export function parseBbox(value: string | undefined): BboxParseResult {
  if (value === undefined) {
    return { status: 'absent' };
  }

  const parts = value.split(',').map((item) => {
    const trimmed = item.trim();
    return trimmed === '' ? Number.NaN : Number(trimmed);
  });
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) {
    return { status: 'invalid' };
  }

  const [lonMin, latMin, lonMax, latMax] = parts;
  const inRange =
    latMin >= -90 && latMin <= 90 &&
    latMax >= -90 && latMax <= 90 &&
    lonMin >= -180 && lonMin <= 180 &&
    lonMax >= -180 && lonMax <= 180;
  const ordered = latMin <= latMax && lonMin <= lonMax;
  if (!inRange || !ordered) {
    return { status: 'invalid' };
  }

  return { status: 'valid', bbox: [latMin, lonMin, latMax, lonMax] };
}

export const flightsRouter = Router();

flightsRouter.get('/live', async (req, res) => {
  const raw = req.query.bbox;
  // Repeated `bbox` query keys arrive as an array — malformed input, not "absent".
  if (Array.isArray(raw)) {
    res.status(400).json({ error: 'Invalid bbox: expected a single lon1,lat1,lon2,lat2 query value.' });
    return;
  }
  const parsed = parseBbox(typeof raw === 'string' ? raw : undefined);
  if (parsed.status === 'invalid') {
    res.status(400).json({ error: 'Invalid bbox: expected lon1,lat1,lon2,lat2 with min <= max inside their ranges.' });
    return;
  }
  const time = typeof req.query.time === 'string' ? Number(req.query.time) : undefined;
  const bbox = parsed.status === 'valid' ? parsed.bbox : undefined;
  const cacheKey = `live:${bbox?.join(',') ?? 'global'}:${time ?? 'now'}`;
  const cached = serverCache.get<{
    flights: unknown[];
    source: 'opensky' | 'mock';
    stale: boolean;
    fetchedAt: string;
  }>(cacheKey);

  if (cached) {
    res.json(cached);
    return;
  }

  const payload = await fetchLiveAircraftStates({
    bbox,
    time: Number.isFinite(time) ? time : undefined,
  });

  const responseBody = {
    ...payload,
    fetchedAt: new Date().toISOString(),
  };

  serverCache.set(cacheKey, responseBody, FLIGHT_CACHE_SECONDS);
  res.json(responseBody);
});

flightsRouter.get('/:icao24/detail', async (req, res) => {
  const icao24 = req.params.icao24?.toLowerCase();
  if (!icao24) {
    res.status(400).json({ error: 'Missing aircraft identifier.' });
    return;
  }

  const callsign = typeof req.query.callsign === 'string' ? req.query.callsign : undefined;
  const cacheKey = `detail:${icao24}:${callsign ?? 'none'}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const detail = await resolveFlightDetail({ icao24, callsign });
  if (!detail) {
    res.status(404).json({ error: 'Flight detail unavailable.' });
    return;
  }

  const responseBody = {
    detail,
    source: process.env.AVIATIONSTACK_KEY ? 'aviationstack-or-mock' : 'mock',
    fetchedAt: new Date().toISOString(),
  };

  serverCache.set(cacheKey, responseBody, DETAIL_CACHE_SECONDS);
  res.json(responseBody);
});
