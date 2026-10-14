// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AirportIndex } from '../../pipeline/airportIndex';
import type { AirportRow } from '../../pipeline/ref';

const KORD: AirportRow = ['KORD', 'ORD', "O'Hare", 'Chicago', 'US', 41.9786, -87.9048, 672, 'America/Chicago'];
const NFFN: AirportRow = ['NFAA', null, 'Wrap', 'X', 'FJ', 0, -179.99, 0, null];

describe('AirportIndex.nearest', () => {
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
