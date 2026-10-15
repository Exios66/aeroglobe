// @vitest-environment node
import { mkdir, mkdtemp, readdir, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkDataDir } from '../../pipeline/publish';
import type { Catalog, CatalogDay } from '../../pipeline/types';

describe('checkDataDir boundaries', () => {
  let dir: string;
  let catalog: Catalog;

  async function file(path: string, body = '{}') {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), body);
  }

  async function saveCatalog(value: unknown = catalog) {
    await file('catalog.json', JSON.stringify(value));
  }

  async function addDay(date: string): Promise<CatalogDay> {
    const day: CatalogDay = {
      date, source: 'test', attribution: 'test', featured: false,
      flightsFile: `flights/${date}.json`,
      hours: Array.from({ length: 24 }, (_, h) => ({ h, file: `tracks/${date}/${String(h).padStart(2, '0')}.json`, bytes: 10, aircraft: 0 })),
    };
    catalog.days.push(day);
    await file(day.flightsFile);
    for (const hour of day.hours) await file(hour.file);
    await saveCatalog();
    return day;
  }

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aeroglobe-data-check-'));
    catalog = { schemaVersion: 1, generatedAt: '2026-10-14T00:00:00Z', days: [], airportsFile: 'ref/airports.json', airlinesFile: 'ref/airlines.json', timezonesFile: 'ref/timezones.topo.json' };
    await file(catalog.airportsFile);
    await file(catalog.airlinesFile);
    await file(catalog.timezonesFile);
    await saveCatalog();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('accepts an empty catalog and counts nested files and their actual bytes', async () => {
    await file('extra/nested/readme.txt', '12345');
    const bytes = Buffer.byteLength(JSON.stringify(catalog)) + 3 * 2 + 5;
    expect(await checkDataDir(dir)).toEqual({ ok: true, problems: [], days: 0, files: 5, totalBytes: bytes });
  });

  it('reports invalid JSON without throwing and still returns file totals', async () => {
    await file('catalog.json', '{broken');
    const result = await checkDataDir(dir);
    expect(result).toMatchObject({ ok: false, days: 0, files: 4, totalBytes: 13 });
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('catalog.json missing or unreadable');
  });

  it('reports both an unsupported schema and missing days array', async () => {
    await saveCatalog({ ...catalog, schemaVersion: 2, days: {} });
    const result = await checkDataDir(dir);
    expect(result).toMatchObject({ ok: false, days: 0 });
    expect(result.problems).toEqual(['catalog.json schemaVersion is 2, expected 1', 'catalog.json has no days array']);
  });

  it.each(['ref/airports.json', 'ref/airlines.json', 'ref/timezones.topo.json'])('reports the missing required file %s', async (path) => {
    await rm(join(dir, path));
    expect(await checkDataDir(dir)).toMatchObject({ ok: false, problems: [`missing ${path}`] });
  });

  it('reports an invalid day date without probing fallback paths for that day', async () => {
    const day = await addDay('2026-10-12');
    day.date = '../invalid';
    await saveCatalog();
    expect(await checkDataDir(dir)).toMatchObject({ ok: false, days: 1, problems: ["invalid date '../invalid'"] });
  });

  it('finds hours by their index in an unsorted catalog', async () => {
    const day = await addDay('2026-10-12');
    day.hours.reverse();
    await saveCatalog();
    expect(await checkDataDir(dir)).toMatchObject({ ok: true, days: 1, problems: [] });
  });

  it('reports a missing hour entry even when its fallback file exists', async () => {
    const day = await addDay('2026-10-12');
    day.hours = day.hours.filter((hour) => hour.h !== 0);
    await saveCatalog();
    expect(await checkDataDir(dir)).toMatchObject({ ok: false, problems: ['2026-10-12: catalog has no entry for hour 0'] });
  });

  it('uses custom hour and flights paths and reports their absence', async () => {
    const day = await addDay('2026-10-12');
    day.hours[0].file = 'custom/hour.json';
    day.flightsFile = 'custom/flights.json';
    await file(day.hours[0].file);
    await file(day.flightsFile);
    await saveCatalog();
    expect((await checkDataDir(dir)).ok).toBe(true);
    await rm(join(dir, day.hours[0].file));
    await rm(join(dir, day.flightsFile));
    expect(await checkDataDir(dir)).toMatchObject({ ok: false, problems: [
      '2026-10-12: missing hour file custom/hour.json',
      '2026-10-12: missing flights file custom/flights.json',
    ] });
  });

  it('accepts the exact hour budget and rejects one byte above it', async () => {
    const day = await addDay('2026-10-12');
    day.hours[0].bytes = 2_000_000;
    await saveCatalog();
    expect((await checkDataDir(dir)).ok).toBe(true);
    day.hours[0].bytes++;
    await saveCatalog();
    expect(await checkDataDir(dir)).toMatchObject({ ok: false, problems: ['2026-10-12 hour 0: 2000001 bytes exceeds 2000000'] });
  });

  it('honors a custom compressed-hour budget', async () => {
    const day = await addDay('2026-10-12');
    day.hours[23].bytes = 11;
    await saveCatalog();
    expect(await checkDataDir(dir, { maxHourBytesGz: 10 })).toMatchObject({ ok: false, problems: ['2026-10-12 hour 23: 11 bytes exceeds 10'] });
  });

  it('checks every day and accumulates independent errors', async () => {
    const first = await addDay('2026-10-12');
    const second = await addDay('2026-10-13');
    await rm(join(dir, first.flightsFile));
    await rm(join(dir, second.hours[23].file));
    const result = await checkDataDir(dir);
    expect(result).toMatchObject({ ok: false, days: 2 });
    expect(result.problems).toEqual([
      '2026-10-12: missing flights file flights/2026-10-12.json',
      '2026-10-13: missing hour file tracks/2026-10-13/23.json',
    ]);
  });

  it('enforces the file-size safety margin for nested files at the boundary', async () => {
    await file('extra/nested/blob.bin', '');
    await truncate(join(dir, 'extra/nested/blob.bin'), 95_000_000);
    expect((await checkDataDir(dir)).ok).toBe(true);
    await truncate(join(dir, 'extra/nested/blob.bin'), 95_000_001);
    expect(await checkDataDir(dir)).toMatchObject({ ok: false, problems: ['extra/nested/blob.bin is 95 MB; GitHub rejects files over 100 MB'] });
    expect(await readdir(join(dir, 'extra/nested'))).toEqual(['blob.bin']);
  });
});
