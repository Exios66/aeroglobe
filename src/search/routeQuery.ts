import type { AirlineRow, AirportRow, FlightRecord } from '../services/staticData';
import type { FlightSearchResult } from '../types/flight';

/** A parsed `AAA-BBB` / `AAA to BBB` / `AAA→BBB` route query. */
export interface RouteQuery {
  dep: string;
  arr: string;
}

/** Parses an explicit airport-pair query; returns null for anything else. */
export function parseRouteQuery(query: string): RouteQuery | null {
  const match = /^([a-z]{3,4})\s*(?:-|→|->|to)\s*([a-z]{3,4})$/i.exec(query.trim());
  return match ? { dep: match[1].toUpperCase(), arr: match[2].toUpperCase() } : null;
}

/** The airport ICAO for a freely-typed IATA or ICAO code, or null when unknown. */
export function resolveAirportCode(code: string, airports: Map<string, AirportRow>): string | null {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return null;
  for (const [icao, row] of airports) {
    if (icao.toLowerCase() === wanted || (row[1] ?? '').toLowerCase() === wanted) {
      return icao;
    }
  }
  return null;
}

function airportLabel(icao: string | null, airports: Map<string, AirportRow>): string {
  if (!icao) return '—';
  return airports.get(icao)?.[1] ?? icao;
}

function recordToResult(
  record: FlightRecord,
  airports: Map<string, AirportRow>,
  airlines: Map<string, AirlineRow>,
): FlightSearchResult {
  const airline = record.al ? airlines.get(record.al) : undefined;
  return {
    icao24: record.icao24,
    callsign: record.cs,
    airline: airline?.[2] ?? record.al ?? 'Unknown airline',
    flightNumber: record.cs?.trim() || record.icao24.toUpperCase(),
    route: `${airportLabel(record.dep.ap, airports)} → ${airportLabel(record.arr.ap, airports)}`,
    status: 'active',
  };
}

/** True when the query explicitly matches the record's callsign, registration, type, or airline prefix. */
function recordMatchesQuery(record: FlightRecord, airline: AirlineRow | undefined, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return false;
  return (
    (record.cs ?? '').toLowerCase().startsWith(wanted) ||
    (record.r ?? '').toLowerCase().startsWith(wanted) ||
    (record.ty ?? '').toLowerCase().startsWith(wanted) ||
    (record.icao24 ?? '').toLowerCase() === wanted ||
    (record.al ?? '').toLowerCase().startsWith(wanted) ||
    (airline?.[1] ?? '').toLowerCase().startsWith(wanted) ||
    (airline?.[2] ?? '').toLowerCase().startsWith(wanted)
  );
}

/**
 * Searches the loaded day's flights index: an explicit route pair (`ORD-DEN`, `jfk to lhr`,
 * `AAA→BBB`) ranks exact pair matches first; any other query falls back to prefix matches over
 * callsign, registration, aircraft type, and airline. Results whose aircraft are present in the
 * loaded hour snapshot come first so selecting one flies straight to it.
 */
export function searchFlightIndex(
  query: string,
  records: FlightRecord[],
  airports: Map<string, AirportRow>,
  airlines: Map<string, AirlineRow>,
  loadedIcao24: Set<string> = new Set(),
): FlightSearchResult[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const route = parseRouteQuery(trimmed);
  const matches: FlightRecord[] = [];

  if (route) {
    const depIcao = resolveAirportCode(route.dep, airports);
    const arrIcao = resolveAirportCode(route.arr, airports);
    if (depIcao && arrIcao) {
      for (const record of records) {
        if (record.dep.ap === depIcao && record.arr.ap === arrIcao) {
          matches.push(record);
        }
      }
    }
  } else {
    for (const record of records) {
      if (recordMatchesQuery(record, record.al ? airlines.get(record.al) : undefined, trimmed)) {
        matches.push(record);
      }
    }
  }

  // Exact callsign/flight-number hits outrank other matches; loaded aircraft outrank unloaded ones.
  matches.sort((a, b) => Number(loadedIcao24.has(b.icao24)) - Number(loadedIcao24.has(a.icao24)));

  return matches.slice(0, 8).map((record) => recordToResult(record, airports, airlines));
}
