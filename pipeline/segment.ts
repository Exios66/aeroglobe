import type { AirportIndex } from './airportIndex';
import { haversineKm } from './geo';
import type { AirportEnd, FlightRecord, RawTrack, TrackPoint } from './types';

export interface SegmentedTrack {
  track: RawTrack;
  /** Per point: index into `flights`, -1 = none (ground). */
  flightOf: Int32Array;
  flights: FlightRecord[];
}

const GAP_S = 1800;
const GAP_ALT_FT = 5000;
const LOOKUP_KM = 5;
const LOW_FT = 3000;

/**
 * Finds an airport within 5 km when altitude is missing or less than 3,000 ft above it.
 * ground selects the confidence label; t is the endpoint time in Unix seconds.
 */
function lookup(airports: AirportIndex, p: TrackPoint, ground: boolean, t: number): AirportEnd {
  const ap = airports.nearest(p.lat, p.lon, LOOKUP_KM);
  if (ap && (p.altFt === null || p.altFt - ap[7] < LOW_FT)) {
    return { ap: ap[0], t, conf: ground ? 'ground' : 'inferred' };
  }
  return { ap: null, t, conf: 'unknown' };
}

/**
 * Groups a normalized track in time order into airborne runs. Ground points separate
 * flights; an airborne gap splits only when it exceeds 1,800 seconds and 5,000 ft of
 * altitude change. Returns the original track, flight records, and per-point flight
 * indices, with -1 for ground points. Endpoint times are the first/last airborne Unix
 * seconds; distance is rounded to kilometers and maximum altitude is in feet.
 * date is YYYY-MM-DD in UTC for flight IDs and hour indices, which are clamped to 0..23.
 * airlineIcaos limits airline recognition from callsigns to known ICAO prefixes.
 */
export function segmentFlights(
  track: RawTrack,
  date: string,
  airports: AirportIndex,
  airlineIcaos: Set<string>,
): SegmentedTrack {
  const pts = track.points;
  const dayStart = Date.parse(`${date}T00:00:00Z`) / 1000;
  const flightOf = new Int32Array(pts.length).fill(-1);
  const flights: FlightRecord[] = [];

  let i = 0;
  while (i < pts.length) {
    if (pts[i].ground) {
      i++;
      continue;
    }
    // Maximal airborne run, split on long gap + big altitude change.
    let j = i + 1;
    while (j < pts.length && !pts[j].ground) {
      const dt = pts[j].t - pts[j - 1].t;
      const dAlt = Math.abs((pts[j].altFt ?? 0) - (pts[j - 1].altFt ?? 0));
      if (dt > GAP_S && dAlt > GAP_ALT_FT) break;
      j++;
    }
    const first = i;
    const last = j - 1;
    const n = flights.length;
    let km = 0;
    let maxAltFt = 0;
    let cs: string | null = null;
    const hourSet = new Set<number>();
    for (let k = first; k <= last; k++) {
      const p = pts[k];
      flightOf[k] = n;
      if (k > first) km += haversineKm(pts[k - 1].lat, pts[k - 1].lon, p.lat, p.lon);
      if (p.altFt !== null && p.altFt > maxAltFt) maxAltFt = p.altFt;
      if (cs === null && p.cs) cs = p.cs;
      hourSet.add(Math.min(23, Math.max(0, Math.floor((p.t - dayStart) / 3600))));
    }
    const depGround = first > 0 && pts[first - 1].ground;
    const arrGround = j < pts.length && pts[j].ground;
    const dep = lookup(airports, depGround ? pts[first - 1] : pts[first], depGround, pts[first].t);
    const arr = lookup(airports, arrGround ? pts[j] : pts[last], arrGround, pts[last].t);
    const prefix = cs?.slice(0, 3) ?? '';
    flights.push({
      id: `${date}/${track.id}/${n + 1}`,
      icao24: track.id,
      cs,
      r: track.reg,
      ty: track.type,
      al: cs !== null && /^[A-Z]{3}\d/.test(cs) && airlineIcaos.has(prefix) ? prefix : null,
      dep,
      arr,
      km: Math.round(km),
      maxAltFt,
      hours: [...hourSet].sort((a, b) => a - b),
    });
    i = j;
  }
  return { track, flightOf, flights };
}
