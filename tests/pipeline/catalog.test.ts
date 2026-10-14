// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergeCatalog } from '../../pipeline/catalog';
import type { Catalog, CatalogDay } from '../../pipeline/types';

const NOW = new Date('2026-10-14T06:00:00.000Z');
const OPTS = { window: 3, now: NOW };

function day(date: string, featured = false): CatalogDay {
  return {
    date,
    source: 'adsb.lol',
    attribution: '© adsb.lol contributors, ODbL',
    featured,
    hours: [],
    flightsFile: `${date}/flights.json`,
  };
}

function catalogOf(days: CatalogDay[]): Catalog {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-13T06:00:00.000Z',
    days,
    airportsFile: 'ref/airports.json',
    airlinesFile: 'ref/airlines.json',
    timezonesFile: 'ref/timezones.topo.json',
  };
}

describe('mergeCatalog', () => {
  it('creates a catalog from null with schemaVersion 1', () => {
    const { catalog, removed } = mergeCatalog(null, day('2026-10-13'), OPTS);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.days.map((d) => d.date)).toEqual(['2026-10-13']);
    expect(catalog.generatedAt).toBe(NOW.toISOString());
    expect(catalog.airportsFile).toBe('ref/airports.json');
    expect(catalog.airlinesFile).toBe('ref/airlines.json');
    expect(catalog.timezonesFile).toBe('ref/timezones.topo.json');
    expect(removed).toEqual([]);
  });

  it('re-adding a date replaces it', () => {
    const existing = catalogOf([day('2026-10-13'), day('2026-10-12')]);
    const replacement = { ...day('2026-10-13'), source: 'replaced' };
    const { catalog, removed } = mergeCatalog(existing, replacement, OPTS);
    expect(catalog.days.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-12']);
    expect(catalog.days[0].source).toBe('replaced');
    expect(removed).toEqual([]);
  });

  it('window 3 with 4 days removes the oldest and returns it in removed', () => {
    const existing = catalogOf([day('2026-10-12'), day('2026-10-11'), day('2026-10-10')]);
    const { catalog, removed } = mergeCatalog(existing, day('2026-10-13'), OPTS);
    expect(catalog.days.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-12', '2026-10-11']);
    expect(removed.map((d) => d.date)).toEqual(['2026-10-10']);
    expect(removed[0]).toEqual(day('2026-10-10'));
    const keptDates = new Set(catalog.days.map((d) => d.date));
    expect(removed.some((d) => keptDates.has(d.date))).toBe(false);
  });

  it('a backfilled day older than the window is kept and never removed', () => {
    const existing = catalogOf([day('2026-10-13'), day('2026-10-12'), day('2026-10-11')]);
    const { catalog, removed } = mergeCatalog(existing, day('2026-10-05'), OPTS);
    expect(catalog.days.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-12', '2026-10-11', '2026-10-05']);
    expect(removed).toEqual([]);
  });

  it.each([0, NaN, -1, 1.5])('throws RangeError for window %s', (window) => {
    expect(() => mergeCatalog(null, day('2026-10-13'), { window, now: NOW })).toThrow(RangeError);
    expect(() => mergeCatalog(null, day('2026-10-13'), { window, now: NOW })).toThrow(
      'window must be an integer >= 1',
    );
  });

  it('a featured old day survives and does not count toward the window', () => {
    const existing = catalogOf([day('2026-10-12'), day('2026-10-11'), day('2026-10-01', true)]);
    const { catalog, removed } = mergeCatalog(existing, day('2026-10-13'), OPTS);
    expect(catalog.days.map((d) => d.date)).toEqual(['2026-10-13', '2026-10-12', '2026-10-11', '2026-10-01']);
    expect(catalog.days[3].featured).toBe(true);
    expect(removed).toEqual([]);
  });

  it('does not mutate the existing catalog', () => {
    const existing = catalogOf([day('2026-10-12'), day('2026-10-11'), day('2026-10-10'), day('2026-10-09')]);
    const snapshot = structuredClone(existing);
    const { catalog } = mergeCatalog(existing, day('2026-10-13'), OPTS);
    expect(existing).toEqual(snapshot);
    expect(existing.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-11', '2026-10-10', '2026-10-09']);
    expect(catalog).not.toBe(existing);
  });
});
