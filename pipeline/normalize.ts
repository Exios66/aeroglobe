import type { ReadsbTrace } from './readsb';
import { haversineKm } from './geo';
import type { RawTrack, TrackPoint } from './types';

const MAX_KT = 1200;
const KM_PER_NM = 1.852;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Converts a readsb trace into a RawTrack. Returns null when the aircraft is dropped
 * (non-ICAO `~` id, category C*, or no usable points).
 * Points are sorted by rounded Unix seconds, retaining the first usable point per second.
 * Non-finite coordinates or airborne altitudes and jumps exceeding 1,200 knots are dropped.
 * Ground altitude becomes null; negative airborne altitude is clamped to zero feet.
 * Callsigns carry forward even from dropped rows; speed and heading carry forward from
 * accepted rows, defaulting to zero, with heading normalized to [0, 360) degrees.
 */
export function normalizeTrace(trace: ReadsbTrace): RawTrack | null {
  if (trace.icao.startsWith('~')) return null;

  let category: string | null = null;
  for (const p of trace.trace) {
    const d = p[8] as { category?: string } | null | undefined;
    if (d && typeof d.category === 'string' && d.category) {
      category = d.category;
      break;
    }
  }
  if (category !== null && category.startsWith('C')) return null;

  // Stable sort by time so duplicate/out-of-order samples are handled deterministically.
  const rows = trace.trace
    .filter((p) => isNum(p[0]))
    .map((p) => ({ p, t: Math.round(trace.timestamp + (p[0] as number)) }))
    .sort((a, b) => a.t - b.t);

  const points: TrackPoint[] = [];
  let cs: string | null = null;
  let gs = 0;
  let trk = 0;
  let lastT: number | null = null;

  for (const { p, t } of rows) {
    // Details carry forward even from dropped points; the callsign is aircraft-level.
    const d = p[8] as { flight?: unknown } | null | undefined;
    if (d && typeof d.flight === 'string') cs = d.flight.trim() || null;

    if (t === lastT) continue; // same-second duplicate (first wins)
    const lat = p[1];
    const lon = p[2];
    if (!isNum(lat) || !isNum(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const alt = p[3];
    const ground = alt === 'ground';
    if (!ground && !isNum(alt)) continue; // null altitude while airborne

    const last = points[points.length - 1];
    if (last) {
      const km = haversineKm(last.lat, last.lon, lat, lon);
      const kt = km / KM_PER_NM / ((t - last.t) / 3600);
      if (kt > MAX_KT) continue;
    }
    lastT = t;

    if (isNum(p[4])) gs = p[4];
    if (isNum(p[5])) trk = ((p[5] % 360) + 360) % 360;
    points.push({
      t,
      lat,
      lon,
      altFt: ground ? null : Math.max(0, alt as number),
      ground,
      gsKt: gs,
      trk,
      cs,
    });
  }

  if (points.length === 0) return null;
  return { id: trace.icao, reg: str(trace.r), type: str(trace.t), category, points };
}
