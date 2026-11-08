import { describe, expect, it } from 'vitest';
import type { AirlineRow, AirportRow, FlightRecord } from '../../src/services/staticData';
import {
  parseRouteQuery,
  resolveAirportCode,
  searchFlightIndex,
} from '../../src/search/routeQuery';

const airports = new Map<string, AirportRow>([
  ['KORD', ['KORD', 'ORD', "Chicago O'Hare", 'Chicago', 'US', 41.98, -87.9, 672, 'America/Chicago']],
  ['KDEN', ['KDEN', 'DEN', 'Denver International', 'Denver', 'US', 39.86, -104.67, 5433, 'America/Denver']],
  ['KLAX', ['KLAX', 'LAX', 'Los Angeles International', 'Los Angeles', 'US', 33.94, -118.41, 128, 'America/Los_Angeles']],
]);
const airlines = new Map<string, AirlineRow>([['UAL', ['UAL', 'UA', 'United Airlines', 'UNITED']]]);

function record(overrides: Partial<FlightRecord>): FlightRecord {
  return {
    id: '2026-10-12/abc123/1',
    icao24: 'abc123',
    cs: 'UAL123',
    r: 'N12345',
    ty: 'B738',
    al: 'UAL',
    dep: { ap: 'KORD', t: 1760230000, conf: 'ground' },
    arr: { ap: 'KDEN', t: 1760238000, conf: 'inferred' },
    km: 1430,
    maxAltFt: 37000,
    hours: [3, 4, 5],
    ...overrides,
  };
}

const records: FlightRecord[] = [
  record({}),
  record({ icao24: 'def456', cs: 'SWA456', r: 'N45678', al: null, dep: { ap: 'KORD', t: 1760240000, conf: 'ground' }, arr: { ap: 'KLAX', t: 1760250000, conf: 'inferred' } }),
  record({ icao24: 'ghi789', cs: 'AAL789', r: 'N789AB', ty: 'A320', dep: { ap: 'KLAX', t: 1760230000, conf: 'ground' }, arr: { ap: 'KORD', t: 1760238000, conf: 'inferred' } }),
  record({ icao24: 'jkl012', cs: 'UAL124', r: 'N12488', dep: { ap: 'KORD', t: 1760250000, conf: 'ground' }, arr: { ap: 'KDEN', t: 1760260000, conf: 'inferred' } }),
];

describe('parseRouteQuery', () => {
  it('parses dash, word, and arrow separators case-insensitively', () => {
    expect(parseRouteQuery('ORD-DEN')).toEqual({ dep: 'ORD', arr: 'DEN' });
    expect(parseRouteQuery('jfk to lhr')).toEqual({ dep: 'JFK', arr: 'LHR' });
    expect(parseRouteQuery('DEN→ORD')).toEqual({ dep: 'DEN', arr: 'ORD' });
    expect(parseRouteQuery('  KLAX - KDEN  ')).toEqual({ dep: 'KLAX', arr: 'KDEN' });
  });

  it('rejects queries that are not airport pairs', () => {
    expect(parseRouteQuery('UAL123')).toBeNull();
    expect(parseRouteQuery('ORD-DEN-XYZ')).toBeNull();
    expect(parseRouteQuery('to')).toBeNull();
    expect(parseRouteQuery('')).toBeNull();
  });
});

describe('resolveAirportCode', () => {
  it('resolves by ICAO or IATA case-insensitively and rejects unknown codes', () => {
    expect(resolveAirportCode('ORD', airports)).toBe('KORD');
    expect(resolveAirportCode('kden', airports)).toBe('KDEN');
    expect(resolveAirportCode('KLAX', airports)).toBe('KLAX');
    expect(resolveAirportCode('XXXX', airports)).toBeNull();
    expect(resolveAirportCode('', airports)).toBeNull();
  });
});

describe('searchFlightIndex', () => {
  it('returns route matches ordered so loaded aircraft come first', () => {
    const results = searchFlightIndex('ORD-DEN', records, airports, airlines, new Set(['jkl012']));
    expect(results).toHaveLength(2);
    expect(results[0].icao24).toBe('jkl012');
    expect(results.every((result) => result.route === 'ORD → DEN')).toBe(true);
  });

  it('matches route pairs typed with IATA codes and the "to" separator', () => {
    const results = searchFlightIndex('lax to ord', records, airports, airlines);
    expect(results).toHaveLength(1);
    expect(results[0].flightNumber).toBe('AAL789');
  });

  it('finds flights by callsign, registration, and type prefixes across the loaded day', () => {
    expect(searchFlightIndex('SWA', records, airports, airlines)).toHaveLength(1);
    expect(searchFlightIndex('N123', records, airports, airlines)).toHaveLength(1);
    expect(searchFlightIndex('B73', records, airports, airlines)).toHaveLength(3);
    expect(searchFlightIndex(' united', records, airports, airlines)).toHaveLength(3);  });

  it('returns nothing below two characters or for unmatched queries', () => {
    expect(searchFlightIndex('B', records, airports, airlines)).toEqual([]);
    expect(searchFlightIndex('XYZZY', records, airports, airlines)).toEqual([]);
    expect(searchFlightIndex('ZZZ-ZZZ', records, airports, airlines)).toEqual([]);
  });

  it('caps results at eight', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      record({ icao24: `id${index}`, cs: `UAL${index}`, id: `2026-10-12/id${index}/1` }));
    expect(searchFlightIndex('UAL', many, airports, airlines)).toHaveLength(8);
  });
});
