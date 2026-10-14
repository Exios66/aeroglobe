// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { AirportIndex } from '../../pipeline/airportIndex';
import { BudgetError, buildHour } from '../../pipeline/chunk';
import { FIXTURE_DATE, generateFixtures } from '../../pipeline/fixtures/generate';
import { normalizeTrace } from '../../pipeline/normalize';
import { buildAirlines, buildAirports } from '../../pipeline/ref';
import { segmentFlights, type SegmentedTrack } from '../../pipeline/segment';
import { DEFAULT_SIMPLIFY, type FlightRecord, type SimplifyOptions, type TrackPoint } from '../../pipeline/types';
import { decodeSamples, type HourChunk } from '../../shared/trackCodec';

const fx = generateFixtures();
const read = (f: string) => readFileSync(new URL(`../../pipeline/inputs/${f}`, import.meta.url), 'utf8');
const DAY0 = Date.parse(`${FIXTURE_DATE}T00:00:00Z`) / 1000;
const BIG = 1e12;

let airports: AirportIndex;
let airlines: Set<string>;

beforeAll(() => {
  airports = new AirportIndex(buildAirports(read('ourairports-filtered.csv'), read('openflights-airports.dat')));
  airlines = new Set(buildAirlines(read('openflights-airlines.dat')).map((a) => a[0]));
});

function seg(name: string): SegmentedTrack {
  const track = normalizeTrace(fx[`${name}.json`]);
  if (!track) throw new Error(`fixture ${name} normalised to null`);
  return segmentFlights(track, FIXTURE_DATE, airports, airlines);
}

const scale = (o: SimplifyOptions, k: number): SimplifyOptions => ({
  minSpacingS: o.minSpacingS * k,
  horizM: o.horizM * k,
  vertFt: o.vertFt * k,
});

/** Synthetic jittery track (deterministic LCG) filling hour 0 of the day, one flight id or ground. */
function noisy(id: string, ground: boolean, seed: number): SegmentedTrack {
  let s = seed;
  const rand = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const points: TrackPoint[] = [];
  for (let i = 0; i < 120; i++) {
    points.push({
      t: DAY0 + i * 30,
      lat: 40 + (rand() - 0.5) * 0.2,
      lon: -100 + (rand() - 0.5) * 0.2,
      altFt: ground ? null : 30000 + Math.round((rand() - 0.5) * 20000),
      ground,
      gsKt: Math.round(rand() * 500),
      trk: Math.round(rand() * 359),
      cs: 'TST1',
    });
  }
  return {
    track: { id, reg: null, type: null, category: null, points },
    flightOf: new Int32Array(points.length).fill(ground ? -1 : 0),
    flights: ground ? [] : [{ id: `${id}/1` } as FlightRecord],
  };
}

const opts = { simplify: DEFAULT_SIMPLIFY, maxBytesGz: BIG };

describe('buildHour', () => {
  it('accepts the exact gzip budget and reports the size of the emitted JSON', () => {
    const tracks = [seg('normal')];
    const full = buildHour(tracks, DAY0, 4, opts);
    expect(full.bytesGz).toBe(gzipSync(full.json, { level: 9 }).length);
    expect(buildHour(tracks, DAY0, 4, { ...opts, maxBytesGz: full.bytesGz })).toEqual(full);
  });

  it('counts unique aircraft across ground and airborne entries', () => {
    const result = buildHour([seg('turnaround')], DAY0, 9, opts);
    expect((JSON.parse(result.json) as HourChunk).a).toHaveLength(3);
    expect(result.aircraft).toBe(1);
  });

  it('does not overlap ground and flight runs and preserves their metadata', () => {
    const segmented = seg('turnaround');
    const chunk = JSON.parse(buildHour([segmented], DAY0, 9, opts).json) as HourChunk;
    for (const entry of chunk.a) {
      expect(entry).toMatchObject({ id: segmented.track.id, r: segmented.track.reg, ty: segmented.track.type });
      const runIndex = entry.f === null ? -1 : segmented.flights.findIndex((f) => f.id === entry.f);
      const run = segmented.track.points.filter((_, i) => segmented.flightOf[i] === runIndex);
      const decoded = decodeSamples(entry.p, chunk.t0);
      expect(decoded[0].t).toBeGreaterThanOrEqual(run[0].t);
      expect(decoded[decoded.length - 1].t).toBeLessThanOrEqual(run[run.length - 1].t);
      expect(decoded.every((p) => (p.altFt === null) === (entry.f === null))).toBe(true);
    }
  });

  it('includes a point exactly at the next hour as overlap and as that hour\'s own sample', () => {
    const input = noisy('boundary', false, 1);
    input.track.points = input.track.points.slice(0, 3).map((p, i) => ({ ...p, t: DAY0 + 3590 + i * 10 }));
    input.flightOf = new Int32Array(3);
    const h0 = JSON.parse(buildHour([input], DAY0, 0, opts).json) as HourChunk;
    const h1 = JSON.parse(buildHour([input], DAY0, 1, opts).json) as HourChunk;
    expect(decodeSamples(h0.a[0].p, h0.t0).map((p) => p.t)).toEqual([DAY0 + 3590, DAY0 + 3600]);
    expect(decodeSamples(h1.a[0].p, h1.t0).map((p) => p.t)).toEqual([DAY0 + 3590, DAY0 + 3610]);
  });

  it('hourboundary: overlap samples on both sides', () => {
    const s = seg('hourboundary');
    const h6 = buildHour([s], DAY0, 6, opts);
    const c6 = JSON.parse(h6.json) as HourChunk;
    const t6 = DAY0 + 6 * 3600;
    expect(c6.t0).toBe(t6);
    const d6 = decodeSamples(c6.a[0].p, t6);
    expect(d6[d6.length - 1].t).toBeGreaterThanOrEqual(t6 + 3600);

    const h7 = buildHour([s], DAY0, 7, opts);
    const c7 = JSON.parse(h7.json) as HourChunk;
    const t7 = DAY0 + 7 * 3600;
    const d7 = decodeSamples(c7.a[0].p, t7);
    expect(d7[0].t).toBeLessThan(t7);
    expect(c7.a[0].p[0]).toBeLessThan(0);
    expect(h7.aircraft).toBe(1);
  });

  it('turnaround within an hour yields two airborne entries plus a ground entry', () => {
    const s = seg('turnaround');
    const c = JSON.parse(buildHour([s], DAY0, 9, opts).json) as HourChunk;
    const air = c.a.filter((e) => e.f !== null);
    const ground = c.a.filter((e) => e.f === null);
    expect(air).toHaveLength(2);
    expect(air[0].id).toBe(air[1].id);
    expect(air[0].f).not.toBe(air[1].f);
    expect(ground).toHaveLength(1);
    expect(c.a.map((e) => e.f)).toEqual([...c.a.map((e) => e.f)].sort((a, b) => (a === null ? -1 : b === null ? 1 : a < b ? -1 : 1)));
  });

  it('empty hour yields an empty chunk', () => {
    const r = buildHour([seg('normal')], DAY0, 20, opts);
    expect(JSON.parse(r.json)).toEqual({ v: 1, t0: DAY0 + 20 * 3600, a: [] });
    expect(r.aircraft).toBe(0);
    expect(r.h).toBe(20);
    expect(r.bytesGz).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const tracks = [seg('turnaround'), seg('normal'), seg('multileg')];
    const a = buildHour(tracks, DAY0, 9, opts);
    const b = buildHour([...tracks].reverse(), DAY0, 9, opts);
    expect(a.json).toBe(b.json);
    expect(buildHour(tracks, DAY0, 9, opts).json).toBe(a.json);
  });

  it('coarsens tolerances to get under budget', () => {
    const tracks = [noisy('a1', false, 1), noisy('a2', false, 2), noisy('a3', false, 3)];
    const full = buildHour(tracks, DAY0, 0, opts);
    const r = buildHour(tracks, DAY0, 0, { simplify: DEFAULT_SIMPLIFY, maxBytesGz: full.bytesGz - 1 });
    expect(r.bytesGz).toBeLessThan(full.bytesGz);
    expect(r.bytesGz).toBeLessThanOrEqual(full.bytesGz - 1);
  });

  it('drops ground entries when only that meets the budget', () => {
    const air = [noisy('a1', false, 1), noisy('a2', false, 2)];
    const ground = [noisy('g1', true, 3), noisy('g2', true, 4), noisy('g3', true, 5)];
    const at16 = { simplify: scale(DEFAULT_SIMPLIFY, 16), maxBytesGz: BIG };
    const without = buildHour(air, DAY0, 0, at16).bytesGz;
    const withG = buildHour([...air, ...ground], DAY0, 0, at16).bytesGz;
    expect(withG).toBeGreaterThan(without);
    const r = buildHour([...air, ...ground], DAY0, 0, {
      simplify: DEFAULT_SIMPLIFY,
      maxBytesGz: Math.floor((without + withG) / 2),
    });
    const c = JSON.parse(r.json) as HourChunk;
    expect(c.a.length).toBe(2);
    expect(c.a.every((e) => e.f !== null)).toBe(true);
    expect(r.aircraft).toBe(2);
  });

  it('throws BudgetError when nothing fits', () => {
    const tracks = [seg('normal')];
    try {
      buildHour(tracks, DAY0, 4, { simplify: DEFAULT_SIMPLIFY, maxBytesGz: 50 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BudgetError);
      expect((e as BudgetError).hour).toBe(4);
    }
  });
});
