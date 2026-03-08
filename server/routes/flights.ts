import { Router } from 'express';
import { serverCache } from '../middleware/cache';
import { resolveFlightDetail } from '../services/flightDetails';
import { fetchLiveAircraftStates } from '../services/opensky';

const FLIGHT_CACHE_SECONDS = 15;
const DETAIL_CACHE_SECONDS = 60 * 60;

function parseBbox(value: string | undefined): [number, number, number, number] | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value.split(',').map((item) => Number(item.trim()));
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) {
    return undefined;
  }

  const [lonMin, latMin, lonMax, latMax] = parts;
  return [latMin, lonMin, latMax, lonMax];
}

export const flightsRouter = Router();

flightsRouter.get('/live', async (req, res) => {
  const bbox = parseBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const time = typeof req.query.time === 'string' ? Number(req.query.time) : undefined;
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
