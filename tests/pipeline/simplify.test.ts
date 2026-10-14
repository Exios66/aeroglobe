// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeTrace } from '../../pipeline/normalize';
import { generateFixtures } from '../../pipeline/fixtures/generate';
import { resamplePoints, sedError, simplifyTrack } from '../../pipeline/simplify';
import { DEFAULT_SIMPLIFY, type TrackPoint } from '../../pipeline/types';

const pt = (t: number, lat: number, lon: number, altFt: number | null = 10000, ground = false): TrackPoint => ({
  t,
  lat,
  lon,
  altFt: ground ? null : altFt,
  ground,
  gsKt: 400,
  trk: 90,
  cs: null,
});

describe('simplifyTrack', () => {
  it('reduces a constant-speed straight line to 2 points', () => {
    const pts = Array.from({ length: 500 }, (_, i) => pt(i * 30, 40, -100 + i * 0.01));
    const out = simplifyTrack(pts, DEFAULT_SIMPLIFY);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(pts[0]);
    expect(out[1]).toBe(pts[499]);
  });

  it('keeps the corner of a 90 degree turn', () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i <= 50; i++) pts.push(pt(i * 30, 40, -100 + i * 0.01));
    for (let i = 1; i <= 50; i++) pts.push(pt((50 + i) * 30, 40 + i * 0.01, -99.5));
    const out = simplifyTrack(pts, DEFAULT_SIMPLIFY);
    expect(out.map((p) => p.t)).toContain(50 * 30);
    expect(out.length).toBeLessThanOrEqual(4);
  });

  it('keeps both points around a ground to airborne transition', () => {
    const pts: TrackPoint[] = [];
    for (let i = 0; i < 20; i++) pts.push(pt(i * 30, 40, -100, null, true));
    for (let i = 20; i < 40; i++) pts.push(pt(i * 30, 40, -100 + (i - 20) * 0.01, 10000, false));
    const out = simplifyTrack(pts, DEFAULT_SIMPLIFY);
    const ts = out.map((p) => p.t);
    expect(ts).toContain(19 * 30);
    expect(ts).toContain(20 * 30);
  });

  it('returns short inputs unchanged', () => {
    expect(simplifyTrack([], DEFAULT_SIMPLIFY)).toEqual([]);
    const one = [pt(0, 1, 1)];
    expect(simplifyTrack(one, DEFAULT_SIMPLIFY)).toEqual(one);
  });
});

describe('sedError', () => {
  it('interpolates by time, wrapping longitude', () => {
    const a = pt(0, 0, 179.9, 0);
    const b = pt(100, 0, -179.9, 10000);
    const mid = pt(50, 0, 180, 5000);
    const e = sedError(mid, a, b);
    expect(e.horizM).toBeLessThan(1);
    expect(e.vertFt).toBeCloseTo(0, 6);
  });

  it('counts ground as zero vertical error', () => {
    const a = pt(0, 0, 0, 0);
    const b = pt(100, 0, 0.1, 10000);
    expect(sedError(pt(50, 0, 0.05, null, true), a, b).vertFt).toBe(0);
    expect(sedError(pt(50, 0, 0.05, 9000), pt(0, 0, 0, null, true), b).vertFt).toBe(0);
  });
});

describe('fixtures', () => {
  const fx = generateFixtures();
  const tracks = Object.entries(fx)
    .map(([name, trace]) => [name, normalizeTrace(trace)] as const)
    .filter((e): e is readonly [string, NonNullable<ReturnType<typeof normalizeTrace>>] => e[1] !== null);

  it('covers fixtures', () => {
    expect(tracks.length).toBeGreaterThanOrEqual(5);
  });

  it.each(tracks)('%s: every resampled point is within tolerance of its simplified segment', (_n, track) => {
    const out = simplifyTrack(track.points, DEFAULT_SIMPLIFY);
    const kept = new Set(out);
    for (const p of resamplePoints(track.points, DEFAULT_SIMPLIFY)) {
      if (kept.has(p)) continue;
      let i = 1;
      while (out[i]!.t < p.t) i++;
      const e = sedError(p, out[i - 1]!, out[i]!);
      expect(e.horizM).toBeLessThanOrEqual(DEFAULT_SIMPLIFY.horizM + 1);
      expect(e.vertFt).toBeLessThanOrEqual(DEFAULT_SIMPLIFY.vertFt + 1);
    }
  });

  it('antimeridian simplifies to < 20% and keeps the crossing intact', () => {
    const track = tracks.find(([n]) => n.startsWith('antimeridian'))![1];
    const out = simplifyTrack(track.points, DEFAULT_SIMPLIFY);
    expect(out.length).toBeLessThan(track.points.length * 0.2);
    expect(out[0]).toBe(track.points[0]);
    expect(out[out.length - 1]).toBe(track.points[track.points.length - 1]);
    // no point dropped across the crossing: kept points exist on both sides
    expect(out.some((p) => p.lon > 0)).toBe(true);
    expect(out.some((p) => p.lon < 0)).toBe(true);
    // no gap in the output spans more than a wrapped-lon sanity bound
    for (let i = 1; i < out.length; i++) {
      const d = Math.abs(((out[i]!.lon - out[i - 1]!.lon + 540) % 360) - 180);
      expect(d).toBeLessThan(60);
    }
  });
});
