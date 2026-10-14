import { gzipSync } from 'node:zlib';
import type { ChunkEntry, HourChunk, SamplePoint } from '../shared/trackCodec';
import { encodeSamples } from '../shared/trackCodec';
import type { SegmentedTrack } from './segment';
import { simplifyTrack } from './simplify';
import type { SimplifyOptions, TrackPoint } from './types';

export interface BuiltHour {
  h: number;
  json: string;
  bytesGz: number;
  aircraft: number;
}

export class BudgetError extends Error {
  constructor(
    public hour: number,
    public bytesGz: number,
  ) {
    super(`hour ${hour} is ${bytesGz} bytes gzipped, over budget`);
    this.name = 'BudgetError';
  }
}

const MULTIPLIERS = [1, 2, 4, 8, 16];

interface RawEntry {
  id: string;
  cs: string | null;
  r: string | null;
  ty: string | null;
  f: string | null;
  points: TrackPoint[];
}

const toSample = (p: TrackPoint): SamplePoint => ({
  t: p.t,
  lat: p.lat,
  lon: p.lon,
  altFt: p.ground ? null : p.altFt,
  gsKt: p.gsKt,
  trk: p.trk,
});

/** One entry per run of equal flightOf that has points in [t0, t0+3600), plus one overlap sample per side. */
function sliceEntries(tracks: SegmentedTrack[], t0: number): RawEntry[] {
  const t1 = t0 + 3600;
  const out: RawEntry[] = [];
  for (const { track, flightOf, flights } of tracks) {
    const pts = track.points;
    let a = 0;
    while (a < pts.length) {
      let b = a + 1;
      while (b < pts.length && flightOf[b] === flightOf[a]) b++;
      let first = -1;
      let last = -1;
      for (let i = a; i < b; i++) {
        if (pts[i].t >= t0 && pts[i].t < t1) {
          if (first < 0) first = i;
          last = i;
        } else if (pts[i].t >= t1) break;
      }
      if (first >= 0) {
        const lo = first > a ? first - 1 : first;
        const hi = last + 1 < b ? last + 1 : last;
        let cs: string | null = null;
        for (let i = b - 1; i >= a; i--) {
          if (pts[i].cs !== null) {
            cs = pts[i].cs;
            break;
          }
        }
        out.push({
          id: track.id,
          cs,
          r: track.reg,
          ty: track.type,
          f: flightOf[a] < 0 ? null : flights[flightOf[a]].id,
          points: pts.slice(lo, hi + 1),
        });
      }
      a = b;
    }
  }
  const key = (f: string | null) => f ?? '';
  out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : key(x.f) < key(y.f) ? -1 : key(x.f) > key(y.f) ? 1 : 0));
  return out;
}

function serialise(entries: RawEntry[], t0: number, opts: SimplifyOptions): string {
  const a: ChunkEntry[] = entries.map((e) => ({
    id: e.id,
    cs: e.cs,
    r: e.r,
    ty: e.ty,
    f: e.f,
    p: encodeSamples(simplifyTrack(e.points, opts).map(toSample), t0),
  }));
  const chunk: HourChunk = { v: 1, t0, a };
  return JSON.stringify(chunk);
}

export function buildHour(
  tracks: SegmentedTrack[],
  dayStart: number,
  h: number,
  opts: { simplify: SimplifyOptions; maxBytesGz: number },
): BuiltHour {
  const t0 = dayStart + h * 3600;
  const all = sliceEntries(tracks, t0);
  const gz = (json: string) => gzipSync(json, { level: 9 }).length;
  const done = (entries: RawEntry[], json: string, bytesGz: number): BuiltHour => ({
    h,
    json,
    bytesGz,
    aircraft: new Set(entries.map((e) => e.id)).size,
  });

  let json = '';
  let bytes = 0;
  for (const k of MULTIPLIERS) {
    json = serialise(all, t0, {
      minSpacingS: opts.simplify.minSpacingS * k,
      horizM: opts.simplify.horizM * k,
      vertFt: opts.simplify.vertFt * k,
    });
    bytes = gz(json);
    if (bytes <= opts.maxBytesGz) return done(all, json, bytes);
  }

  const airborne = all.filter((e) => e.f !== null);
  const k = MULTIPLIERS[MULTIPLIERS.length - 1];
  json = serialise(airborne, t0, {
    minSpacingS: opts.simplify.minSpacingS * k,
    horizM: opts.simplify.horizM * k,
    vertFt: opts.simplify.vertFt * k,
  });
  bytes = gz(json);
  if (bytes <= opts.maxBytesGz) return done(airborne, json, bytes);
  throw new BudgetError(h, bytes);
}
