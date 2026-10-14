import { vi } from 'vitest';
import { encodeSamples } from '../../shared/trackCodec';

/** A one-hour catalog day holding one aircraft with a matching flights index entry. */
export function staticDataFixtures() {
  const t0 = 1760227200;
  const chunk = {
    v: 1,
    t0,
    a: [
      {
        id: 'abc123',
        cs: 'UAL1',
        r: null,
        ty: null,
        f: '2026-10-12/abc123/1',
        p: encodeSamples(
          [{ t: t0 + 60, lat: 40.6, lon: -73.7, altFt: 10000, gsKt: 220, trk: 80 }],
          t0,
        ),
      },
    ],
  };
  const flights = {
    v: 1,
    flights: [
      {
        id: '2026-10-12/abc123/1',
        icao24: 'abc123',
        cs: 'UAL1',
        r: null,
        ty: null,
        al: 'UAL',
        dep: { ap: 'KORD', t: t0 + 60, conf: 'inferred' },
        arr: { ap: 'KDEN', t: t0 + 120, conf: 'inferred' },
        km: 1420,
        maxAltFt: 10000,
        hours: [0],
      },
    ],
  };
  const airports = [
    ['KORD', 'ORD', "Chicago O'Hare", 'Chicago', 'US', 41.98, -87.9, 672, null],
    ['KDEN', 'DEN', 'Denver International', 'Denver', 'US', 39.86, -104.67, 5433, null],
  ];
  const airlines = [['UAL', 'UA', 'United Airlines', 'UNITED']];
  const catalog = {
    schemaVersion: 1,
    generatedAt: '2026-10-12T00:00:00Z',
    days: [
      {
        date: '2026-10-12',
        source: 'opensky',
        attribution: 'test',
        featured: false,
        hours: [{ h: 0, file: 'tracks/2026-10-12/00.json', bytes: 10, aircraft: 1 }],
        flightsFile: 'flights/2026-10-12.json',
      },
    ],
    airportsFile: 'ref/airports.json',
    airlinesFile: 'ref/airlines.json',
    timezonesFile: 'ref/timezones.topo.json',
  };
  return { chunk, catalog, flights, airports, airlines };
}

/** Stubs fetch to answer the static catalog, chunk, flights, and reference paths. */
export function stubStaticDataFetch() {
  const { chunk, catalog, flights, airports, airlines } = staticDataFixtures();
  const bodies: Record<string, unknown> = {
    'catalog.json': catalog,
    'flights/2026-10-12.json': flights,
    'ref/airports.json': airports,
    'ref/airlines.json': airlines,
    'tracks/2026-10-12/00.json': chunk,
  };
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const key = Object.keys(bodies).find((path) => url.endsWith(path));
      if (!key) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(bodies[key]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}
