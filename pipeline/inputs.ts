import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { filterOurAirportsCsv } from './ref';

export const SOURCES = {
  ourairports: 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
  openflightsAirports: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat',
  openflightsAirlines: 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat',
} as const;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.text();
}

/** Fetches the three reference sources into `dir`; OurAirports is written already filtered. */
export async function downloadInputs(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const [oa, ofAirports, ofAirlines] = await Promise.all([
    fetchText(SOURCES.ourairports),
    fetchText(SOURCES.openflightsAirports),
    fetchText(SOURCES.openflightsAirlines),
  ]);
  await writeFile(join(dir, 'ourairports-filtered.csv'), filterOurAirportsCsv(oa));
  await writeFile(join(dir, 'openflights-airports.dat'), ofAirports);
  await writeFile(join(dir, 'openflights-airlines.dat'), ofAirlines);
}
