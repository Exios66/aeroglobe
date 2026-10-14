import { haversineM, wrapLonDelta } from './geo';
import type { SimplifyOptions, TrackPoint } from './types';

/**
 * Synchronised Euclidean distance of p from the a..b segment: b is interpolated
 * linearly in time. Ground points (or ground endpoints) have zero vertical error.
 */
export function sedError(p: TrackPoint, a: TrackPoint, b: TrackPoint): { horizM: number; vertFt: number } {
  const span = b.t - a.t;
  const f = span > 0 ? (p.t - a.t) / span : 0;
  const lat = a.lat + f * (b.lat - a.lat);
  const lon = a.lon + f * wrapLonDelta(b.lon - a.lon);
  const horizM = haversineM(p.lat, p.lon, lat, lon);
  let vertFt = 0;
  if (!p.ground && !a.ground && !b.ground && p.altFt !== null && a.altFt !== null && b.altFt !== null) {
    vertFt = Math.abs(p.altFt - (a.altFt + f * (b.altFt - a.altFt)));
  }
  return { horizM, vertFt };
}

/** Step 1: keep first/last, points spaced >= minSpacingS, and ground-state changes. */
export function resamplePoints(points: TrackPoint[], opts: SimplifyOptions): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  const out: TrackPoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const last = out[out.length - 1]!;
    if (p.t - last.t >= opts.minSpacingS || p.ground !== last.ground) out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function simplifyTrack(points: TrackPoint[], opts: SimplifyOptions): TrackPoint[] {
  const pts = resamplePoints(points, opts);
  const n = pts.length;
  if (n <= 2) return pts;

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  for (let i = 1; i < n; i++) {
    if (pts[i]!.ground !== pts[i - 1]!.ground) {
      keep[i - 1] = 1;
      keep[i] = 1;
    }
  }

  // Iterative RDP between every pair of consecutive anchors.
  const stack: Array<[number, number]> = [];
  let prev = 0;
  for (let i = 1; i < n; i++) {
    if (!keep[i]) continue;
    if (i - prev > 1) stack.push([prev, i]);
    prev = i;
  }
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let worst = 1;
    let worstIdx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const e = sedError(pts[i]!, pts[lo]!, pts[hi]!);
      const ratio = Math.max(e.horizM / opts.horizM, e.vertFt / opts.vertFt);
      if (ratio > worst) {
        worst = ratio;
        worstIdx = i;
      }
    }
    if (worstIdx < 0) continue;
    keep[worstIdx] = 1;
    if (worstIdx - lo > 1) stack.push([lo, worstIdx]);
    if (hi - worstIdx > 1) stack.push([worstIdx, hi]);
  }
  return pts.filter((_, i) => keep[i]);
}
