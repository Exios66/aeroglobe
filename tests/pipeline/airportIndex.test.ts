// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AirportIndex } from '../../pipeline/airportIndex';
import type { AirportRow } from '../../pipeline/ref';

const KORD: AirportRow = ['KORD', 'ORD', "O'Hare", 'Chicago', 'US', 41.9786, -87.9048, 672, 'America/Chicago'];
const NFFN: AirportRow = ['NFAA', null, 'Wrap', 'X', 'FJ', 0, -179.99, 0, null];

describe('AirportIndex.nearest', () => {
  it('returns null for an empty index', () => {
    expect(new AirportIndex([]).nearest(0, 0, 5)).toBeNull();
  });

  it('allows an exact match at zero radius', () => {
    expect(new AirportIndex([KORD]).nearest(KORD[5], KORD[6], 0)).toBe(KORD);
  });

  it('selects the closest of several airports across cell boundaries regardless of input order', () => {
    const far: AirportRow = ['FARR', null, 'Far', '', '', -0.02, -0.02, 0, null];
    const near: AirportRow = ['NEAR', null, 'Near', '', '', 0.001, 0.001, 0, null];
    for (const rows of [[near, far], [far, near]]) {
      expect(new AirportIndex(rows).nearest(-0.001, -0.001, 5)).toBe(near);
    }
  });

  const idx = new AirportIndex([KORD, NFFN]);
  // ~3.0 km north of KORD
  const lat = 41.9786 + 3 / 111.195;
  it('returns the airport within maxKm', () => {
    expect(idx.nearest(lat, -87.9048, 5)).toBe(KORD);
  });
  it('returns null beyond maxKm', () => {
    expect(idx.nearest(lat, -87.9048, 1)).toBeNull();
  });
  it('wraps across the antimeridian', () => {
    expect(idx.nearest(0, 179.99, 5)).toBe(NFFN);
  });
});
