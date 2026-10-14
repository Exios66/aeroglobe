// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { haversineKm, haversineM, wrapLonDelta } from '../../pipeline/geo';

describe('pipeline geography', () => {
  it.each([[358, -2], [-358, 2], [720, 0], [-721, -1], [15, 15]])(
    'wraps %s degrees to %s', (input, expected) => expect(wrapLonDelta(input)).toBe(expected),
  );

  it('measures zero distance and a quarter of the equator in the expected units', () => {
    expect(haversineKm(20, 30, 20, 30)).toBe(0);
    expect(haversineKm(0, 0, 0, 90)).toBeCloseTo(10007.557, 3);
    expect(haversineM(0, 0, 0, 1)).toBeCloseTo(111195.08, 2);
  });

  it('uses the short path across the antimeridian symmetrically', () => {
    expect(haversineKm(0, 179.99, 0, -179.99)).toBeCloseTo(2.2239, 4);
    expect(haversineKm(0, -179.99, 0, 179.99)).toBeCloseTo(2.2239, 4);
  });

  it('remains finite for antipodal points', () => {
    expect(haversineKm(90, 0, -90, 180)).toBeCloseTo(20015.114, 3);
  });
});
