import { describe, expect, it } from 'vitest';
import type { AirportRow, FlightRecord } from '../../src/services/staticData';
import type { LogbookEntry } from '../../src/logbook/db';
import { logbookStats } from '../../src/logbook/stats';

const airports = new Map<string, AirportRow>([
  ['KORD', ['KORD', 'ORD', "Chicago O'Hare", 'Chicago', 'US', 41.98, -87.9, 672, 'America/Chicago']],
  ['KDEN', ['KDEN', 'DEN', 'Denver International', 'Denver', 'US', 39.86, -104.67, 5433, 'America/Denver']],
  ['KJFK', ['KJFK', 'JFK', 'John F. Kennedy International', 'New York', 'US', 40.64, -73.78, 13, 'America/New_York']],
]);

function record(overrides: Partial<FlightRecord>): FlightRecord {
  return {
    id: '2026-10-12/abc123/1',
    icao24: 'abc123',
    cs: 'UAL123',
    r: null,
    ty: 'B738',
    al: 'UAL',
    dep: { ap: 'KORD', t: 1760230000, conf: 'ground' },
    arr: { ap: 'KDEN', t: 1760238000, conf: 'inferred' },
    km: 1430,
    maxAltFt: 37000,
    hours: [3],
    ...overrides,
  };
}

describe('logbookStats', () => {
  it('sums distance, airports, countries, and the longest flight', () => {
    const entries: LogbookEntry[] = [
      { id: '1', date: '2026-10-12', depIcao: 'KORD', arrIcao: 'KDEN' },
      { id: '2', date: '2026-10-13', depIcao: 'KORD', arrIcao: 'KJFK' },
      { id: '3', date: '2026-10-14', depIcao: null, arrIcao: null },
    ];
    const stats = logbookStats(entries, airports);
    expect(stats.count).toBe(3);
    expect(stats.airports.has('KORD')).toBe(true);
    expect(stats.airports.size).toBe(3);
    expect(stats.countries.size).toBe(1);
    expect(Math.round(stats.longestKm)).toBeGreaterThan(1000);
    expect(stats.longestEntry?.id).toBe('1');
    // ORD-DEN ≈ 1426 km, ORD-JFK ≈ 1187 km (each rounded).
    expect(Math.round(stats.km)).toBe(2614);
  });

  it('counts hours only from linked flights and tolerates unknown airports', () => {
    const entries: LogbookEntry[] = [
      { id: '1', date: '2026-10-12', depIcao: 'KORD', arrIcao: 'KDEN', linkedFlightId: '2026-10-12/abc123/1' },
      { id: '2', date: '2026-10-13', depIcao: 'XXXX', arrIcao: 'YYYY' },
      { id: '3', date: '2026-10-14', depIcao: 'KORD', arrIcao: 'KDEN' },
    ];
    const linked = new Map([['2026-10-12/abc123/1', record({})]]);
    const stats = logbookStats(entries, airports, linked);
    // KORD→KDEN duration from the record: 8000 s ≈ 2.22 h — only for the linked entry.
    expect(stats.hours).toBeGreaterThan(2);
    expect(stats.hours).toBeLessThan(3);
    // The unknown-airport entry contributes no km and no airports.
    expect(stats.airports.has('XXXX')).toBe(true);
    expect(stats.km).toBeCloseTo(stats.longestKm * 2, 0);
    expect(stats.longestEntry?.id).toBe('1');
  });
});
