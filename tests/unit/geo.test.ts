import { describe, expect, it } from 'vitest';
import { greatCirclePoints, haversineDistance } from '../../src/utils/geo';

describe('geo utils', () => {
  it('returns a predictable number of great-circle points', () => {
    const points = greatCirclePoints([-73.7781, 40.6413], [-0.4543, 51.47], 12);
    expect(points).toHaveLength(12);
    expect(points[0]?.[0]).toBeCloseTo(-73.7781, 4);
    expect(points[0]?.[1]).toBeCloseTo(40.6413, 4);
    expect(points[11]?.[0]).toBeCloseTo(-0.4543, 4);
    expect(points[11]?.[1]).toBeCloseTo(51.47, 4);
  });

  it('calculates a known approximate distance', () => {
    const distance = haversineDistance([-73.7781, 40.6413], [-0.4543, 51.47]);
    expect(distance).toBeGreaterThan(5400);
    expect(distance).toBeLessThan(5600);
  });
});
