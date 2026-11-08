import { haversineDistance } from '../utils/geo';
import type { AirportRow, FlightRecord } from '../services/staticData';
import type { LogbookEntry } from './db';

/** The airport row layout is [icao, iata, name, city, country, lat, lon, elevFt, tz]. */
const AP = { COUNTRY: 4, LAT: 5, LON: 6 } as const;

export interface LogbookStats {
  count: number;
  km: number;
  /** Hours summed over linked flights with resolvable dep/arr times. */
  hours: number;
  airports: Set<string>;
  countries: Set<string>;
  longestKm: number;
  longestEntry: LogbookEntry | null;
}

/**
 * Aggregates logbook entries: km from the great-circle distance between airports, hours only
 * from linked flights (unlinked entries claim no duration), airports and countries from the
 * reference rows, and the longest flight.
 */
export function logbookStats(
  entries: LogbookEntry[],
  airports: Map<string, AirportRow>,
  linkedFlights: Map<string, FlightRecord> = new Map(),
): LogbookStats {
  const stats: LogbookStats = {
    count: entries.length,
    km: 0,
    hours: 0,
    airports: new Set(),
    countries: new Set(),
    longestKm: 0,
    longestEntry: null,
  };

  for (const entry of entries) {
    let entryKm: number | null = null;

    if (entry.depIcao && entry.arrIcao) {
      for (const icao of [entry.depIcao, entry.arrIcao]) {
        stats.airports.add(icao);
        const country = airports.get(icao)?.[AP.COUNTRY];
        if (country) stats.countries.add(country);
      }
      const dep = airports.get(entry.depIcao);
      const arr = airports.get(entry.arrIcao);
      if (dep && arr) {
        entryKm = haversineDistance(
          [dep[AP.LON], dep[AP.LAT]],
          [arr[AP.LON], arr[AP.LAT]],
        );
      }
    }

    if (entryKm != null) {
      stats.km += entryKm;
      if (entryKm > stats.longestKm) {
        stats.longestKm = entryKm;
        stats.longestEntry = entry;
      }
    }

    const linked = entry.linkedFlightId ? linkedFlights.get(entry.linkedFlightId) : undefined;
    if (linked) {
      stats.hours += Math.max(0, (linked.arr.t - linked.dep.t) / 3600);
    }
  }

  return stats;
}
