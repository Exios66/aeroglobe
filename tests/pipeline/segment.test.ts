// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { AirportIndex } from '../../pipeline/airportIndex';
import { FIXTURE_DATE, generateFixtures } from '../../pipeline/fixtures/generate';
import { normalizeTrace } from '../../pipeline/normalize';
import { buildAirlines, buildAirports } from '../../pipeline/ref';
import { segmentFlights, type SegmentedTrack } from '../../pipeline/segment';

const fx = generateFixtures();
const read = (f: string) => readFileSync(new URL(`../../pipeline/inputs/${f}`, import.meta.url), 'utf8');

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

describe('segmentFlights', () => {
  it('normal: one flight KORD to KDEN', () => {
    const { flights } = seg('normal');
    expect(flights).toHaveLength(1);
    const f = flights[0];
    expect(f.id).toBe('2026-10-12/f00001/1');
    expect(f.dep).toMatchObject({ ap: 'KORD', conf: 'ground' });
    expect(f.arr).toMatchObject({ ap: 'KDEN', conf: 'ground' });
    expect(Math.abs(f.km - 1430) / 1430).toBeLessThan(0.03);
    expect(f.maxAltFt).toBe(37000);
    expect(f.al).toBe('UAL');
    expect(f.hours).toEqual([3, 4, 5]);
  });

  it('multileg: two flights with ids /1 and /2', () => {
    const { flights } = seg('multileg');
    expect(flights.map((f) => f.id)).toEqual(['2026-10-12/f00002/1', '2026-10-12/f00002/2']);
    expect([flights[0].dep.ap, flights[0].arr.ap]).toEqual(['KORD', 'KDEN']);
    expect([flights[1].dep.ap, flights[1].arr.ap]).toEqual(['KDEN', 'KLAX']);
  });

  it('gap: two flights, second has unknown departure', () => {
    const { flights } = seg('gap');
    expect(flights).toHaveLength(2);
    expect(flights[1].dep.conf).toBe('unknown');
  });

  it('groundonly: no flights, all points -1', () => {
    const { flights, flightOf } = seg('groundonly');
    expect(flights).toHaveLength(0);
    expect(Array.from(flightOf).every((v) => v === -1)).toBe(true);
  });

  it('flight still airborne at end of day has unknown arrival', () => {
    const { flights } = seg('midnight');
    expect(flights).toHaveLength(1);
    expect(flights[0].arr.conf).toBe('unknown');
    expect(flights[0].arr.ap).toBeNull();
  });

  it('turnaround yields two flights', () => {
    const { flights } = seg('turnaround');
    expect(flights.map((f) => f.id)).toEqual(['2026-10-12/f00009/1', '2026-10-12/f00009/2']);
  });

  it('flightOf indexes flights and marks ground as -1', () => {
    const { track, flightOf, flights } = seg('normal');
    expect(flightOf.length).toBe(track.points.length);
    track.points.forEach((p, i) => {
      if (p.ground) expect(flightOf[i]).toBe(-1);
      else expect(flightOf[i]).toBeGreaterThanOrEqual(0);
    });
    expect(Math.max(...flightOf)).toBe(flights.length - 1);
  });

  it('pins the fixture flight total at 11', () => {
    const counts: Record<string, number> = {};
    for (const [name, tr] of Object.entries(fx)) {
      const track = normalizeTrace(tr);
      if (track) counts[name.replace('.json', '')] = segmentFlights(track, FIXTURE_DATE, airports, airlines).flights.length;
    }
    expect(counts).toMatchObject({
      normal: 1, multileg: 2, gap: 2, groundonly: 0, antimeridian: 1,
      glitch: 1, hourboundary: 1, midnight: 1, turnaround: 2,
    });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(11);
  });
});
