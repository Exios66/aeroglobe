// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeSamples, encodeSamples, quantise, type SamplePoint } from '../../shared/trackCodec';

const pt = (o: Partial<SamplePoint>): SamplePoint => ({
  t: 1000,
  lat: 51.4706,
  lon: -0.4619,
  altFt: 3000,
  gsKt: 250,
  trk: 90,
  ...o,
});

describe('trackCodec', () => {
  it('encodes a known sequence as absolute integers followed by signed deltas', () => {
    const points = [
      pt({ t: 990, lat: 1, lon: -2, altFt: null, gsKt: 10, trk: 359 }),
      pt({ t: 1010, lat: 1.0001, lon: -2.0002, altFt: 1000, gsKt: 9, trk: 0 }),
      pt({ t: 1030, lat: 1, lon: -2, altFt: null, gsKt: 0, trk: 90 }),
    ];
    const encoded = [-10, 10000, -20000, -1, 10, 359, 20, 1, -2, 41, -1, -359, 20, -1, 2, -41, -9, 90];
    expect(encodeSamples(points, 1000)).toEqual(encoded);
    expect(decodeSamples(encoded, 1000)).toEqual(points);
  });

  it('handles empty tracks in either direction', () => {
    expect(encodeSamples([], 1000)).toEqual([]);
    expect(decodeSamples([], 1000)).toEqual([]);
  });

  it('distinguishes ground from zero altitude after quantisation', () => {
    expect(quantise(pt({ altFt: 0 })).altFt).toBe(0);
    expect(quantise(pt({ altFt: 12.49 })).altFt).toBe(0);
    expect(quantise(pt({ altFt: 12.5 })).altFt).toBe(25);
    expect(quantise(pt({ lat: -0.00001, lon: -0.00001, gsKt: 0 })).lat).toBe(0);
  });

  it('never lets a slightly negative altitude collide with the ground sentinel', () => {
    expect(quantise(pt({ altFt: -25 })).altFt).toBe(0);
    expect(encodeSamples([pt({ altFt: -25 })], 1000)[3]).toBe(0);
    expect(decodeSamples(encodeSamples([pt({ altFt: -25 })], 1000), 1000)[0].altFt).toBe(0);
    expect(quantise(pt({ altFt: null })).altFt).toBeNull();
  });

  it('round-trips quantised values', () => {
    const t0 = 1000;
    const pts = [
      pt({ t: 990.4, lat: 51.47063, lon: 179.95, altFt: null, gsKt: 12.4, trk: 271.3 }),
      pt({ t: 1010, lat: 51.4801, lon: 179.95, altFt: 1013, gsKt: 160.6, trk: 359.6 }),
      pt({ t: 1030, lat: -33.9461, lon: -179.97, altFt: 36000, gsKt: 480, trk: 0 }),
    ];
    expect(decodeSamples(encodeSamples(pts, t0), t0)).toEqual(pts.map(quantise));
  });

  it('first group is absolute and may be negative', () => {
    const p = encodeSamples([pt({ t: 990 })], 1000);
    expect(p[0]).toBe(-10);
  });

  it('ground encodes as -1', () => {
    expect(encodeSamples([pt({ altFt: null })], 1000)[3]).toBe(-1);
  });

  it('quantise rounds lat/lon, altitude, and wraps trk', () => {
    const q = quantise(pt({ lat: 12.34567, lon: -45.67894, altFt: 1013, trk: 359.6 }));
    expect(q.lat).toBe(12.3457);
    expect(q.lon).toBe(-45.6789);
    expect(q.altFt).toBe(1025);
    expect(q.trk).toBe(0);
    expect(quantise(pt({ altFt: null })).altFt).toBeNull();
  });
});
