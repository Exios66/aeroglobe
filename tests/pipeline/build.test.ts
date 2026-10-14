// @vitest-environment node
import { cp, mkdtemp, readdir, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDay } from '../../pipeline/build';
import { FIXTURE_DATE } from '../../pipeline/fixtures/generate';
import { fixtureSource } from '../../pipeline/sources/fixtures';
import type { Catalog, FlightRecord } from '../../pipeline/types';

const GOLDEN = 'pipeline/fixtures/golden';

async function list(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await list(p, base)));
    else out.push(relative(base, p).split('\\').join('/'));
  }
  return out.sort();
}

let tmp: string;
let catalog: Catalog;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'aeroglobe-build-'));
  catalog = await buildDay({
    date: FIXTURE_DATE,
    source: fixtureSource,
    outDir: tmp,
    now: new Date('2026-10-13T00:00:00Z'),
    window: 3,
    maxBytesGz: 2_000_000,
    tzInput: 'pipeline/fixtures/timezones.geojson',
    refInputsDir: 'pipeline/inputs',
  });
}, 120_000);

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('buildDay', () => {
  it('matches the golden output byte for byte', async () => {
    if (process.env.UPDATE_GOLDEN === '1') {
      await rm(GOLDEN, { recursive: true, force: true });
      await mkdir(GOLDEN, { recursive: true });
      await cp(tmp, GOLDEN, { recursive: true });
      return;
    }
    const files = await list(tmp);
    expect(files).toEqual(await list(GOLDEN));
    for (const f of files) {
      const [a, b] = await Promise.all([readFile(join(tmp, f)), readFile(join(GOLDEN, f))]);
      expect(a.equals(b), f).toBe(true);
    }
  });

  it('lists 24 hours and writes the 11 expected flights', async () => {
    expect(catalog.days).toHaveLength(1);
    expect(catalog.days[0].hours).toHaveLength(24);
    const raw = await readFile(join(tmp, 'flights', `${FIXTURE_DATE}.json`), 'utf8');
    const { v, flights } = JSON.parse(raw) as { v: number; flights: FlightRecord[] };
    expect(v).toBe(1);
    expect(flights).toHaveLength(11);
    expect(raw).not.toContain('nonicao');
    for (const f of await list(tmp)) {
      if (f.startsWith('tracks/')) expect(await readFile(join(tmp, f), 'utf8')).not.toContain('nonicao');
    }
  });
});
