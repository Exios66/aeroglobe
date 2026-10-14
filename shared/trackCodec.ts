export interface SamplePoint {
  t: number;
  lat: number;
  lon: number;
  altFt: number | null; // null = on ground
  gsKt: number;
  trk: number;
}

export interface ChunkEntry {
  id: string;
  cs: string | null;
  r: string | null;
  ty: string | null;
  f: string | null;
  p: number[];
}

export interface HourChunk {
  v: 1;
  t0: number;
  a: ChunkEntry[];
}

const GROUP = 6;

// Math.round that never returns -0 (keeps deep-equality stable).
const rnd = (x: number): number => Math.round(x) + 0;

function toInts(p: SamplePoint, t0: number): number[] {
  return [
    rnd(p.t - t0),
    rnd(p.lat * 1e4),
    rnd(p.lon * 1e4),
    p.altFt === null ? -1 : rnd(p.altFt / 25),
    rnd(p.gsKt),
    rnd(p.trk) % 360,
  ];
}

function fromInts(g: number[], t0: number): SamplePoint {
  return {
    t: t0 + g[0],
    lat: g[1] / 1e4,
    lon: g[2] / 1e4,
    altFt: g[3] === -1 ? null : g[3] * 25,
    gsKt: g[4],
    trk: g[5],
  };
}

/** The lossy values a decode of the encoded point returns. */
export function quantise(p: SamplePoint): SamplePoint {
  return fromInts(toInts(p, 0), 0);
}

export function encodeSamples(points: SamplePoint[], t0: number): number[] {
  const out: number[] = [];
  let prev: number[] | null = null;
  for (const pt of points) {
    const cur = toInts(pt, t0);
    for (let i = 0; i < GROUP; i++) out.push(prev ? cur[i] - prev[i] : cur[i]);
    prev = cur;
  }
  return out;
}

export function decodeSamples(p: number[], t0: number): SamplePoint[] {
  const out: SamplePoint[] = [];
  const acc = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i + GROUP <= p.length; i += GROUP) {
    for (let j = 0; j < GROUP; j++) acc[j] += p[i + j];
    out.push(fromInts(acc, t0));
  }
  return out;
}
