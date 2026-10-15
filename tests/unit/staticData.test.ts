import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFlightDetail, dataBaseUrl, latestHour, loadLatestStates, type AirportRow, type AirlineRow } from '../../src/services/staticData';
import { staticDataFixtures, stubStaticDataFetch } from '../helpers/staticData';

afterEach(() => {
  vi.unstubAllGlobals();
});

const airports = new Map<string, AirportRow>([
  ['KORD', ['KORD', 'ORD', "Chicago O'Hare", 'Chicago', 'US', 41.98, -87.9, 672, null]],
  ['KDEN', ['KDEN', 'DEN', 'Denver International', 'Denver', 'US', 39.86, -104.67, 5433, null]],
]);
const airlines = new Map<string, AirlineRow>([['UAL', ['UAL', 'UA', 'United Airlines', 'UNITED']]]);

describe('dataBaseUrl', () => {
  it('defaults to data/ under the app base and normalises an explicit URL', () => {
    expect(dataBaseUrl({ BASE_URL: '/aeroglobe/' })).toBe('/aeroglobe/data/');
    expect(dataBaseUrl({ BASE_URL: '/', VITE_DATA_BASE_URL: 'https://data.example.test/out' })).toBe(
      'https://data.example.test/out/',
    );
    expect(dataBaseUrl({ BASE_URL: '/', VITE_DATA_BASE_URL: 'https://data.example.test/out/' })).toBe(
      'https://data.example.test/out/',
    );
  });
});

describe('buildFlightDetail', () => {
  const { flights, catalog } = staticDataFixtures();
  const record = flights.flights[0];

  it('resolves airport cities, coordinates, airline, and route from the reference rows', () => {
    const detail = buildFlightDetail(record, catalog.days[0], airports, airlines);
    expect(detail).toMatchObject({
      flightNumber: 'UAL1',
      airline: 'United Airlines',
      airlineIata: 'UA',
      originIata: 'ORD',
      originCity: 'Chicago',
      destinationIata: 'DEN',
      destinationCity: 'Denver',
    });
    expect(detail.originCoordinates).toEqual([-87.9, 41.98]);
    expect(detail.routeCoordinates).toHaveLength(2);
  });

  it('falls back to placeholders when the airports and airline are unknown', () => {
    const detail = buildFlightDetail(
      { ...record, dep: { ...record.dep, ap: null }, arr: { ...record.arr, ap: null }, al: null },
      catalog.days[0],
      new Map(),
      new Map(),
    );
    expect(detail).toMatchObject({ originIata: '—', originCity: 'Unknown', airline: 'Unknown airline' });
    expect(detail.routeCoordinates).toEqual([]);
  });

  it('keeps an explicit transport in the detail even without reference rows', () => {
    const detail = buildFlightDetail({ ...record, ty: 'B738', r: 'N12345' }, catalog.days[0], airports, airlines);
    expect(detail).toMatchObject({ aircraftType: 'B738', registration: 'N12345' });
  });
});

describe('loadLatestStates', () => {
  it('loads the populated snapshot hour instead of requesting empty hour 23', async () => {
    const { catalog, chunk, flights, airports, airlines } = staticDataFixtures();
    const populated = catalog.days[0].hours[0];
    catalog.days[0].hours = Array.from({ length: 24 }, (_, h) => h === 0 ? populated : {
      h, file: `tracks/2026-10-12/${String(h).padStart(2, '0')}.json`, bytes: 10, aircraft: 0,
    });
    const bodies: Record<string, unknown> = {
      '/data/catalog.json': catalog,
      '/data/tracks/2026-10-12/00.json': chunk,
      '/data/flights/2026-10-12.json': flights,
      '/data/ref/airports.json': airports,
      '/data/ref/airlines.json': airlines,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const body = bodies[String(input)];
      return body === undefined ? new Response('not found', { status: 404 }) : Response.json(body);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { states } = await loadLatestStates('/data/');
    expect(states).toHaveLength(1);
    expect(states[0].icao24).toBe('abc123');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain('/data/tracks/2026-10-12/00.json');
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContain('/data/tracks/2026-10-12/23.json');
  });

  it('joins the newest chunk with the flights index and returns the day', async () => {
    stubStaticDataFetch();
    const { states, day, flights } = await loadLatestStates('/data/');
    expect(day.date).toBe('2026-10-12');
    expect(flights).toBe(1);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({ icao24: 'abc123', callsign: 'UAL1' });
    expect(states[0].detail).toMatchObject({ originIata: 'ORD', destinationIata: 'DEN', airline: 'United Airlines' });
  });

  it('keeps aircraft without an index entry and tolerates missing reference files', async () => {
    const { catalog, chunk, flights } = staticDataFixtures();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('catalog.json')) return new Response(JSON.stringify(catalog), { status: 200 });
        if (url.endsWith('tracks/2026-10-12/00.json')) return new Response(JSON.stringify(chunk), { status: 200 });
        if (url.endsWith('flights/2026-10-12.json')) return new Response(JSON.stringify({ v: 1, flights: [] }), { status: 200 });
        return new Response('nope', { status: 404 });
      }),
    );
    expect(flights.flights).toHaveLength(1);
    const { states } = await loadLatestStates('/data/');
    expect(states[0].detail).toBeUndefined();
  });

  it('throws when the catalog has no days', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 1, generatedAt: '', days: [] }), { status: 200 })),
    );
    await expect(loadLatestStates('/data/')).rejects.toThrow(/no hours to load/);
  });
});

describe('latestHour', () => {
  const hr = (h: number, aircraft: number) => ({ h, file: `tracks/d/${h}.json`, bytes: 1, aircraft });
  const day = (hours: ReturnType<typeof hr>[]) => ({ date: 'd', source: 's', attribution: 'a', featured: false, hours, flightsFile: 'f' });

  it('prefers the latest hour that has aircraft', () => {
    expect(latestHour(day([hr(14, 5), hr(22, 3), hr(23, 0)]))?.h).toBe(22);
    expect(latestHour(day([hr(23, 0), hr(14, 5)]))?.h).toBe(14);
  });
  it('falls back to the greatest hour when all are empty', () => {
    expect(latestHour(day([hr(3, 0), hr(9, 0)]))?.h).toBe(9);
  });
  it('is null for no hours', () => {
    expect(latestHour(day([]))).toBeNull();
  });
  it('keeps hour zero when it is the only populated hour', () => {
    const first = hr(0, 1);
    expect(latestHour(day([hr(23, 0), first, hr(12, 0)]))).toBe(first);
  });
  it('selects by hour index rather than aircraft count or array position', () => {
    const newest = hr(22, 1);
    const hours = [hr(23, 0), newest, hr(4, 100)];
    const before = structuredClone(hours);
    expect(latestHour(day(hours))).toBe(newest);
    expect(hours).toEqual(before);
  });
  it('finds the fallback hour in a descending array of empty hours', () => {
    const newest = hr(23, 0);
    expect(latestHour(day([newest, hr(12, 0), hr(0, 0)]))).toBe(newest);
  });
});
