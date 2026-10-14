// @vitest-environment node
import { cp, stat, mkdtemp, readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildDay } from '../../pipeline/build';
import { runCli } from '../../pipeline/cli';
import { FIXTURE_DATE } from '../../pipeline/fixtures/generate';
import { fixtureSource } from '../../pipeline/sources/fixtures';
import { BudgetError } from '../../pipeline/chunk';
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

async function snapshot(dir: string): Promise<Map<string, Buffer>> {
  const m = new Map<string, Buffer>();
  for (const f of await list(dir)) m.set(f, await readFile(join(dir, f)));
  return m;
}

const base = () => ({
  source: fixtureSource,
  now: new Date('2026-10-13T00:00:00Z'),
  window: 3,
  maxBytesGz: 2_000_000,
  refInputsDir: 'pipeline/inputs',
});

describe('buildDay on an existing outDir', () => {
  it('leaves outDir untouched when the budget fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aeroglobe-atomic-'));
    try {
      await buildDay({ ...base(), date: FIXTURE_DATE, outDir: dir });
      const before = await snapshot(dir);
      await expect(buildDay({ ...base(), date: FIXTURE_DATE, outDir: dir, maxBytesGz: 50 })).rejects.toBeInstanceOf(
        BudgetError,
      );
      const after = await snapshot(dir);
      expect([...after.keys()]).toEqual([...before.keys()]);
      for (const [k, v] of before) expect(after.get(k)!.equals(v), k).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('removes days outside the window and is idempotent per date', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aeroglobe-merge-'));
    try {
      await buildDay({ ...base(), date: FIXTURE_DATE, outDir: dir, window: 1 });
      const next = await buildDay({ ...base(), date: '2026-10-13', outDir: dir, window: 1 });
      expect(next.days.map((d) => d.date)).toEqual(['2026-10-13']);
      await expect(stat(join(dir, 'tracks', FIXTURE_DATE))).rejects.toThrow();
      await expect(stat(join(dir, 'flights', `${FIXTURE_DATE}.json`))).rejects.toThrow();
      const once = await snapshot(dir);
      const again = await buildDay({ ...base(), date: '2026-10-13', outDir: dir, window: 1 });
      expect(again.days).toHaveLength(1);
      const twice = await snapshot(dir);
      expect([...twice.keys()]).toEqual([...once.keys()]);
      for (const [k, v] of once) expect(twice.get(k)!.equals(v), k).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a malformed date', async () => {
    await expect(buildDay({ ...base(), date: '../x', outDir: tmp })).rejects.toThrow(/invalid date/);
  });

  it('leaves outDir untouched when staging fails mid-write', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'aeroglobe-stage-fail-'));
    try {
      await buildDay({ ...base(), date: FIXTURE_DATE, outDir: dir });
      await writeFile(join(dir, 'ref', 'airports.json'), 'sentinel');
      await writeFile(join(dir, 'tracks', '2026-10-13'), 'blocker-file');
      const before = await snapshot(dir);
      await expect(buildDay({ ...base(), date: '2026-10-13', outDir: dir })).rejects.toThrow();
      const after = await snapshot(dir);
      expect([...after.keys()]).toEqual([...before.keys()]);
      for (const [k, v] of before) expect(after.get(k)!.equals(v), k).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects CLI fixture builds for dates other than FIXTURE_DATE', async () => {
    await expect(runCli(['build', '--source', 'fixtures', '--date', '2026-10-13', '--out', tmp])).rejects.toThrow(
      `source 'fixtures' only supports ${FIXTURE_DATE}`,
    );
  });
});
