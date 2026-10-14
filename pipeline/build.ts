import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { AirportIndex } from './airportIndex';
import { buildHour } from './chunk';
import { mergeCatalog } from './catalog';
import { normalizeTrace } from './normalize';
import { buildAirlines, buildAirports } from './ref';
import { segmentFlights, type SegmentedTrack } from './segment';
import { simplifyTrack } from './simplify';
import type { TraceSource } from './sources/types';
import { buildTimezones } from './timezones';
import { DEFAULT_SIMPLIFY, type Catalog, type CatalogDay, type FlightRecord } from './types';

export interface BuildOptions {
  date: string;
  source: TraceSource;
  outDir: string;
  now: Date;
  window: number;
  maxBytesGz: number;
  featured?: boolean;
  tzInput?: string;
  refInputsDir: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function put(outDir: string, rel: string, body: string | Buffer): Promise<void> {
  const p = join(outDir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body);
}

async function readCatalog(outDir: string): Promise<Catalog | null> {
  try {
    return JSON.parse(await readFile(join(outDir, 'catalog.json'), 'utf8')) as Catalog;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

/** Builds one day of chunks, flights and reference data into outDir and merges it into catalog.json. */
export async function buildDay(o: BuildOptions): Promise<Catalog> {
  if (!DATE_RE.test(o.date)) throw new Error(`invalid date '${o.date}', expected YYYY-MM-DD`);
  const [csv, ofAirports, ofAirlines] = await Promise.all([
    readFile(join(o.refInputsDir, 'ourairports-filtered.csv'), 'utf8'),
    readFile(join(o.refInputsDir, 'openflights-airports.dat'), 'utf8'),
    readFile(join(o.refInputsDir, 'openflights-airlines.dat'), 'utf8'),
  ]);
  const airports = buildAirports(csv, ofAirports);
  const airlines = buildAirlines(ofAirlines);
  // Everything is computed in memory first; nothing touches outDir until the whole build succeeds.
  const pending: Array<[string, string | Buffer]> = [
    ['ref/airports.json', JSON.stringify(airports)],
    ['ref/airlines.json', JSON.stringify(airlines)],
  ];
  if (o.tzInput) {
    const scratch = await mkdtemp(join(tmpdir(), 'aeroglobe-tz-'));
    try {
      const out = join(scratch, 'timezones.topo.json');
      await buildTimezones(o.tzInput, out);
      pending.push(['ref/timezones.topo.json', await readFile(out)]);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  const index = new AirportIndex(airports);
  const airlineIcaos = new Set(airlines.map((a) => a[0]));
  const segmented: SegmentedTrack[] = [];
  for await (const trace of o.source.traces(o.date)) {
    const track = normalizeTrace(trace);
    if (!track) continue;
    track.points = simplifyTrack(track.points, DEFAULT_SIMPLIFY);
    segmented.push(segmentFlights(track, o.date, index, airlineIcaos));
  }

  const dayStart = Date.parse(`${o.date}T00:00:00Z`) / 1000;
  const hours: CatalogDay['hours'] = [];
  for (let h = 0; h < 24; h++) {
    const built = buildHour(segmented, dayStart, h, { simplify: DEFAULT_SIMPLIFY, maxBytesGz: o.maxBytesGz });
    const hh = String(h).padStart(2, '0');
    const file = `tracks/${o.date}/${hh}.json`;
    pending.push([file, built.json]);
    hours.push({ h, file, bytes: built.bytesGz, aircraft: built.aircraft });
  }

  const flights: FlightRecord[] = segmented
    .flatMap((s) => s.flights)
    .sort((a, b) => a.dep.t - b.dep.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const flightsFile = `flights/${o.date}.json`;
  pending.push([flightsFile, JSON.stringify({ v: 1, flights })]);

  const day: CatalogDay = {
    date: o.date,
    source: o.source.name,
    attribution: o.source.attribution,
    featured: o.featured ?? false,
    hours,
    flightsFile,
  };
  const { catalog, removed } = mergeCatalog(await readCatalog(o.outDir), day, { window: o.window, now: o.now });
  for (const d of removed) if (!DATE_RE.test(d.date)) throw new Error(`refusing to remove day with invalid date '${d.date}'`);
  for (const [rel, body] of pending) await put(o.outDir, rel, body);
  for (const d of removed) {
    await rm(join(o.outDir, 'tracks', d.date), { recursive: true, force: true });
    await rm(join(o.outDir, 'flights', `${d.date}.json`), { force: true });
  }
  await put(o.outDir, 'catalog.json', JSON.stringify(catalog, null, 2));
  return catalog;
}
