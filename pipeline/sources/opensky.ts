import type { ReadsbTrace } from '../readsb';
import type { TraceSource } from './types';

type StateRow = unknown[];

/** Shape of the subset of OpenSky `/states/all` rows this adapter reads. */
export interface OpenSkySnapshot {
  /** Unix seconds of the response. */
  time: number;
  states: StateRow[] | null;
}

const OPEN_SKY_URL = 'https://opensky-network.org/api/states/all';

/** Optional Basic auth for the OpenSky API; without it the anonymous quota applies. */
function authHeader(): Record<string, string> {
  const user = process.env.OPENSKY_USER;
  const pass = process.env.OPENSKY_PASS;
  if (!user || !pass) return {};
  return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
}

/** Fetches a global state-vector snapshot for the current instant. @throws {Error} On a non-OK response. */
export async function fetchOpenSkySnapshot(): Promise<OpenSkySnapshot> {
  const response = await fetch(OPEN_SKY_URL, { headers: authHeader() });
  if (!response.ok) throw new Error(`OpenSky request failed with status ${response.status}`);
  return (await response.json()) as OpenSkySnapshot;
}

/**
 * Converts one state-vector row into a single-point readsb trace, or null when the row has
 * no usable aircraft, position, or contact time. `on_ground` is ignored: OpenSky leaves
 * altitude unset for ground rows, which becomes `'ground'` in the trace format.
 */
export function rowToTrace(row: StateRow, fallbackTime: number): ReadsbTrace | null {
  const icao = row[0];
  const callsign = typeof row[1] === 'string' ? row[1].trim() : '';
  const lastContact = typeof row[4] === 'number' ? row[4] : fallbackTime;
  const lon = row[5];
  const lat = row[6];
  const alt = row[7];
  const ground = row[8] === true;
  const gs = row[9];
  const track = row[10];
  if (typeof icao !== 'string' || !/^[0-9a-f]{6}$/i.test(icao)) return null;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const altitude = ground ? 'ground' : typeof alt === 'number' ? alt * 3.28084 : null;
  if (altitude === null) return null;

  const t = Math.round(lastContact || fallbackTime);
  return {
    icao: icao.toLowerCase(),
    timestamp: t,
    // [dtSec, lat, lon, alt, gs, trk, flags, vrate, details]
    trace: [
      [
        0,
        lat,
        lon,
        altitude,
        typeof gs === 'number' ? gs * 1.94384 : null,
        typeof track === 'number' ? track : null,
        false,
        null,
        callsign ? { flight: callsign } : null,
      ],
    ],
  };
}

/**
 * Builds a TraceSource from already-parsed snapshots by keeping, per aircraft, the newest
 * snapshots up to `maxPoints` at least `minSpacingS` apart. Points are ordered by time so
 * the pipeline's per-second dedupe keeps them.
 */
export function snapshotsToTraceSource(
  snapshots: OpenSkySnapshot[],
  opts: { name: string; attribution: string; minSpacingS?: number; maxPoints?: number },
): TraceSource {
  return {
    name: opts.name,
    attribution: opts.attribution,
    async *traces(): AsyncGenerator<ReadsbTrace> {
      const minSpacing = opts.minSpacingS ?? 300;
      const maxPoints = opts.maxPoints ?? 24;
      const byId = new Map<string, ReadsbTrace[]>();
      for (const snap of snapshots) {
        for (const row of snap.states ?? []) {
          const trace = rowToTrace(row, snap.time);
          if (!trace) continue;
          const list = byId.get(trace.icao) ?? [];
          const last = list[list.length - 1];
          if (last && trace.timestamp - last.timestamp < minSpacing) continue;
          list.push(trace);
          byId.set(trace.icao, list);
        }
      }
      for (const list of byId.values()) {
        const kept = list.slice(-maxPoints);
        if (kept.length === 0) continue;
        const head = kept[0];
        const points = kept.map((t) => {
          const p = [...t.trace[0]];
          p[0] = t.timestamp - head.timestamp;
          return p;
        });
        yield { icao: head.icao, timestamp: head.timestamp, trace: points };
      }
    },
  };
}
