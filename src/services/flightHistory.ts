import type { FlightRecord } from './staticData';

/** Every indexed flight of one airframe, earliest departure first. */
export function flightsOfAirframe(records: FlightRecord[], icao24: string): FlightRecord[] {
  return records
    .filter((record) => record.icao24 === icao24)
    .sort((a, b) => a.dep.t - b.dep.t);
}

/** The UTC hour block in which an instant falls: 0–23. */
export function hourOf(instantSeconds: number): number {
  return Math.floor(instantSeconds / 3600) % 24;
}

/** Duration of an indexed flight in whole minutes (never negative). */
export function flightDurationMinutes(record: FlightRecord): number {
  return Math.max(0, Math.round((record.arr.t - record.dep.t) / 60));
}
