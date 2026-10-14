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
