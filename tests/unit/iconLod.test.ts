import { describe, expect, it } from 'vitest';
import { getAircraftDartSvg, getAircraftDotSvg, getAircraftSvg } from '../../src/utils/aircraftIcon';
import { lodForAircraft, lodScale, resolveIconLod } from '../../src/globe/iconLod';

describe('resolveIconLod', () => {
  it('shows the full plane only at national scale with modest counts', () => {
    expect(resolveIconLod(600_000, 300)).toBe('plane');
    expect(resolveIconLod(1_199_999, 400)).toBe('plane');
  });

  it('degrades to the dart at regional scale while density allows', () => {
    expect(resolveIconLod(1_300_000, 400)).toBe('dart');
    expect(resolveIconLod(3_999_999, 1200)).toBe('dart');
  });

  it('drops to signal dots globally or when the view is overcrowded', () => {
    expect(resolveIconLod(5_000_000, 400)).toBe('dot');
    expect(resolveIconLod(4_500_000, 6793)).toBe('dot');
    // Over 1,500 visible, only a much closer camera buys the plane shapes back.
    expect(resolveIconLod(800_000, 1600)).toBe('dot');
    expect(resolveIconLod(500_000, 1600)).toBe('plane');
  });
});

describe('lodForAircraft / lodScale', () => {
  it('upgrades the selected aircraft to the full plane regardless of LOD', () => {
    expect(lodForAircraft('dot', true)).toBe('plane');
    expect(lodForAircraft('dot', false)).toBe('dot');
    expect(lodForAircraft('dart', false)).toBe('dart');
  });

  it('keeps dots slightly larger so they stay tappable', () => {
    expect(lodScale('dot')).toBeGreaterThan(lodScale('plane')! * 0.8);
    expect(lodScale('plane')).toBe(0.6);
  });
});

describe('LOD icon set', () => {
  it('renders distinct, minimal shapes that read at small sizes', () => {
    const dot = getAircraftDotSvg(35000);
    const dart = getAircraftDartSvg(35000);
    const plane = getAircraftSvg(35000);

    // The dot is exactly two circles — no wing detail to blur into noise.
    expect(dot.match(/<circle/g)?.length).toBe(2);
    expect(dot).not.toContain('<path');
    // The signal stays slim: a 9 px core with at most a modest 17 px halo.
    expect(dot).toContain('r="9"');
    expect(dot).toContain('r="17"');
    // The dart is one bold silhouette with a heavier outline than the detailed plane.
    expect(dart).toContain('stroke-width="2.4"');
    expect(dart).toContain('M32 5 L38 25');
    expect(plane).toContain('stroke-width="1.7"');
    // All three keep the altitude-tier color coding (35,000 ft = the cyan tier).
    for (const svg of [dot, dart, plane]) {
      expect(svg).toContain('#22d3ee');
    }
    expect(getAircraftDartSvg(20000)).toContain('#facc15');
  });

  it('rings the selected dot in white', () => {
    const dot = getAircraftDotSvg(20000, true);
    expect(dot).toContain('stroke="rgba(255,255,255,0.55)"');
    expect(dot).toContain('#ffffff');
  });
});
