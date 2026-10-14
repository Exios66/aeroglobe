import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildAirports, type AirportRow } from '../ref';
import type { ReadsbTrace } from '../readsb';

export const FIXTURE_DATE = '2026-10-12';

const DAY0 = Date.parse(`${FIXTURE_DATE}T00:00:00Z`) / 1000;
const STEP = 5;
const rad = Math.PI / 180;

/** Seconds since midnight UTC of FIXTURE_DATE for a clock time. */
const at = (h: number, m = 0, s = 0) => DAY0 + h * 3600 + m * 60 + s;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

interface Pt {
  t: number;
  lat: number;
  lon: number;
  alt: number | 'ground';
  gs: number;
  trk: number;
}
interface Place {
  lat: number;
  lon: number;
  elev: number;
}

type Vec = [number, number, number];
const toVec = (lat: number, lon: number): Vec => [
  Math.cos(lat * rad) * Math.cos(lon * rad),
  Math.cos(lat * rad) * Math.sin(lon * rad),
  Math.sin(lat * rad),
];
const fromVec = (v: Vec): [number, number] => [
  Math.atan2(v[2], Math.hypot(v[0], v[1])) / rad,
  Math.atan2(v[1], v[0]) / rad,
];

function greatCircle(a: Place, b: Place): { at: (f: number) => [number, number]; km: number } {
  const va = toVec(a.lat, a.lon);
  const vb = toVec(b.lat, b.lon);
  const dot = Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
  const omega = Math.acos(dot);
  const so = Math.sin(omega);
  return {
    km: omega * 6371.0088,
    at: (f) => {
      const ka = so < 1e-12 ? 1 - f : Math.sin((1 - f) * omega) / so;
      const kb = so < 1e-12 ? f : Math.sin(f * omega) / so;
      return fromVec([ka * va[0] + kb * vb[0], ka * va[1] + kb * vb[1], ka * va[2] + kb * vb[2]]);
    },
  };
}

function bearing(a: [number, number], b: [number, number]): number {
  const dLon = (b[1] - a[1]) * rad;
  const y = Math.sin(dLon) * Math.cos(b[0] * rad);
  const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos(dLon);
  return norm360(Math.atan2(y, x) / rad);
}

interface LegOpts {
  from: Place;
  to: Place;
  /** Schedule of the whole leg (progress is linear in time). */
  t0: number;
  t1: number;
  /** Sample window within the leg; defaults to the whole leg. */
  s0?: number;
  s1?: number;
  cruiseFt: number;
  /** Minutes of linear climb/descent at the ends; 0 holds cruiseFt throughout. */
  climbMin?: number;
  descMin?: number;
  /** Also emit a final sample at s1 even when it is not on the 5 s grid. */
  tail?: boolean;
}

/** Airborne samples every 5 s along a great circle. */
function leg(o: LegOpts): Pt[] {
  const gc = greatCircle(o.from, o.to);
  const dur = o.t1 - o.t0;
  const kt = Math.round(((gc.km / 1.852) / (dur / 3600)) * 10) / 10;
  const s0 = o.s0 ?? o.t0;
  const s1 = o.s1 ?? o.t1;
  const times: number[] = [];
  for (let t = s0; t <= s1; t += STEP) times.push(t);
  if (o.tail && times[times.length - 1] !== s1) times.push(s1);
  return times.map((t) => {
    const f = (t - o.t0) / dur;
    const pos = gc.at(f);
    const ahead = f < 0.999 ? gc.at(Math.min(1, f + 0.001)) : pos;
    const trk = f < 0.999 ? bearing(pos, ahead) : bearing(gc.at(f - 0.001), pos);
    let alt = o.cruiseFt;
    if (o.climbMin || o.descMin) {
      const lo = o.from.elev + 50;
      const lod = o.to.elev + 50;
      const up = o.climbMin ? lo + (o.cruiseFt - lo) * Math.min(1, (t - o.t0) / (o.climbMin * 60)) : o.cruiseFt;
      const down = o.descMin ? lod + (o.cruiseFt - lod) * Math.min(1, (o.t1 - t) / (o.descMin * 60)) : o.cruiseFt;
      alt = Math.round(Math.min(up, down) / 25) * 25;
    }
    return { t, lat: r5(pos[0]), lon: r5(pos[1]), alt, gs: kt, trk: Math.round(trk * 10) / 10 };
  });
}

/** Slow random-walk taxi samples near an airport reference point. */
function taxi(apt: Place, t0: number, t1: number, rng: () => number): Pt[] {
  const out: Pt[] = [];
  let lat = apt.lat;
  let lon = apt.lon;
  let hdg = rng() * 360;
  for (let t = t0; t <= t1; t += STEP) {
    const kt = Math.round((2 + rng() * 8) * 10) / 10;
    hdg = norm360(hdg + (rng() - 0.5) * 60);
    out.push({ t, lat: r5(lat), lon: r5(lon), alt: 'ground', gs: kt, trk: Math.round(hdg * 10) / 10 });
    const m = kt * 0.514444 * STEP;
    lat += (m * Math.cos(hdg * rad)) / 111195;
    lon += (m * Math.sin(hdg * rad)) / (111195 * Math.cos(lat * rad));
  }
  return out;
}

interface Meta {
  icao: string;
  r: string;
  t: string;
  cs: string;
  cat: string;
}

function toTrace(meta: Meta, pts: Pt[]): ReadsbTrace {
  const timestamp = pts[0].t;
  const flight = meta.cs.padEnd(8, ' ');
  const trace = pts.map((p, i) => {
    const next = pts[i + 1];
    const vrate =
      typeof p.alt === 'number' && next && typeof next.alt === 'number'
        ? Math.round(((next.alt - p.alt) / (next.t - p.t)) * 60 / 64) * 64
        : 0;
    const details = i % 120 === 0 ? { flight, category: meta.cat } : null;
    return [p.t - timestamp, p.lat, p.lon, p.alt, p.gs, p.trk, 0, vrate, details];
  });
  return { icao: meta.icao, r: meta.r, t: meta.t, timestamp, trace };
}

function loadAirports(): Map<string, Place> {
  const dir = new URL('../inputs/', import.meta.url);
  const rows: AirportRow[] = buildAirports(
    readFileSync(new URL('ourairports-filtered.csv', dir), 'utf8'),
    readFileSync(new URL('openflights-airports.dat', dir), 'utf8'),
  );
  const m = new Map<string, Place>();
  for (const r of rows) m.set(r[0], { lat: r[5], lon: r[6], elev: r[7] });
  return m;
}

/** Deterministic synthetic readsb traces for 2026-10-12, keyed by file name. */
export function generateFixtures(): Record<string, ReadsbTrace> {
  const ap = loadAirports();
  const get = (icao: string): Place => {
    const p = ap.get(icao);
    if (!p) throw new Error(`airport ${icao} missing from pipeline/inputs`);
    return p;
  };
  const KORD = get('KORD');
  const KDEN = get('KDEN');
  const KLAX = get('KLAX');
  const out: Record<string, ReadsbTrace> = {};
  const profile = { climbMin: 18, descMin: 22 };

  // 1. normal: KORD -> KDEN, airborne 03:10-05:20, FL370, taxi at both ends.
  {
    const rng = mulberry32(1);
    const pts = [
      ...taxi(KORD, at(3, 0), at(3, 9, 55), rng),
      ...leg({ from: KORD, to: KDEN, t0: at(3, 10), t1: at(5, 20), cruiseFt: 37000, ...profile }),
      ...taxi(KDEN, at(5, 20, 5), at(5, 30), rng),
    ];
    const tr = toTrace({ icao: 'f00001', r: 'N12345', t: 'B738', cs: 'UAL123', cat: 'A3' }, pts);
    // Exercise rounding: fractional dt that rounds onto the same second, plus one near-duplicate row.
    for (let i = 0; i < tr.trace.length; i += 401) tr.trace[i][0] = (tr.trace[i][0] as number) + 0.3;
    const dupSrc = tr.trace[600].slice();
    dupSrc[0] = (dupSrc[0] as number) + 0.4;
    dupSrc[8] = null;
    tr.trace.splice(601, 0, dupSrc);
    out['normal.json'] = tr;
  }

  // 2. multileg: KORD -> KDEN, ~40 min on the ground, KDEN -> KLAX.
  {
    const rng = mulberry32(2);
    const pts = [
      ...taxi(KORD, at(8, 0), at(8, 9, 55), rng),
      ...leg({ from: KORD, to: KDEN, t0: at(8, 10), t1: at(10, 20), cruiseFt: 36000, ...profile }),
      ...taxi(KDEN, at(10, 20, 5), at(11, 0), rng),
      ...leg({ from: KDEN, to: KLAX, t0: at(11, 0, 5), t1: at(13, 0), cruiseFt: 35000, ...profile }),
      ...taxi(KLAX, at(13, 0, 5), at(13, 5), rng),
    ];
    out['multileg.json'] = toTrace({ icao: 'f00002', r: 'N45678', t: 'A320', cs: 'DAL456', cat: 'A3' }, pts);
  }

  // 3. gap: airborne only, 45 min of missing data, resumes 8,000 ft lower.
  {
    const base = { from: KORD, to: KDEN, t0: at(10, 0), t1: at(12, 0) };
    const pts = [
      ...leg({ ...base, s1: at(10, 40), cruiseFt: 36000 }),
      ...leg({ ...base, s0: at(11, 25), cruiseFt: 28000 }),
    ];
    out['gap.json'] = toTrace({ icao: 'f00003', r: 'N78901', t: 'B737', cs: 'SWA789', cat: 'A3' }, pts);
  }

  // 4. groundonly: taxi at KORD only.
  out['groundonly.json'] = toTrace(
    { icao: 'f00004', r: 'N24680', t: 'E175', cs: 'AAL12', cat: 'A2' },
    taxi(KORD, at(14, 0), at(14, 20), mulberry32(4)),
  );

  // 5. antimeridian: airborne only, FL390, lon 175 -> -175 along lat ~40.
  out['antimeridian.json'] = toTrace(
    { icao: 'f00005', r: 'JA801J', t: 'B77W', cs: 'JAL5', cat: 'A5' },
    leg({
      from: { lat: 40, lon: 175, elev: 0 },
      to: { lat: 40, lon: -175, elev: 0 },
      t0: at(11, 0),
      t1: at(12, 0),
      cruiseFt: 39000,
    }),
  );

  // 6. nonicao: TIS-B style id, must be dropped.
  out['nonicao.json'] = toTrace(
    { icao: '~abc123', r: 'N999ZZ', t: 'C172', cs: 'N999ZZ', cat: 'A1' },
    leg({
      from: { lat: 41, lon: -88, elev: 0 },
      to: { lat: 41.3, lon: -87.5, elev: 0 },
      t0: at(6, 0),
      t1: at(6, 10),
      cruiseFt: 4500,
    }),
  );

  // 7. glitch: straight cruise with exactly one point ~300 km off-track.
  {
    const pts = leg({
      from: { lat: 45, lon: -100, elev: 0 },
      to: { lat: 45, lon: -90, elev: 0 },
      t0: at(12, 0),
      t1: at(13, 0),
      cruiseFt: 35000,
    });
    pts[Math.floor(pts.length / 2)].lat = r5(pts[Math.floor(pts.length / 2)].lat + 2.7);
    out['glitch.json'] = toTrace({ icao: 'f00006', r: 'N31415', t: 'B752', cs: 'FDX31', cat: 'A3' }, pts);
  }

  // 8. hourboundary: airborne-only cruise 06:50-07:20.
  out['hourboundary.json'] = toTrace(
    { icao: 'f00007', r: 'N27182', t: 'B789', cs: 'FDX99', cat: 'A5' },
    leg({
      from: { lat: 35, lon: -100, elev: 0 },
      to: { lat: 38, lon: -97, elev: 0 },
      t0: at(6, 50),
      t1: at(7, 20),
      cruiseFt: 36000,
    }),
  );

  // 9. midnight: taxi at KLAX, departs 23:30, still airborne at 23:59:59.
  {
    const rng = mulberry32(9);
    const pts = [
      ...taxi(KLAX, at(23, 20), at(23, 29, 55), rng),
      ...leg({
        from: KLAX,
        to: KDEN,
        t0: at(23, 30),
        t1: at(23, 30) + 7800,
        s1: at(23, 59, 59),
        cruiseFt: 37000,
        tail: true,
        ...profile,
      }),
    ];
    out['midnight.json'] = toTrace({ icao: 'f00008', r: 'N16180', t: 'B738', cs: 'UAL2468', cat: 'A3' }, pts);
  }

  // 10. turnaround: lands KDEN 09:05, on the ground until departing 09:40, same hour.
  {
    const rng = mulberry32(10);
    const pts = [
      ...leg({ from: KORD, to: KDEN, t0: at(6, 55), t1: at(9, 5), s0: at(8, 50), cruiseFt: 37000, ...profile }),
      ...taxi(KDEN, at(9, 5, 5), at(9, 39, 55), rng),
      ...leg({
        from: KDEN,
        to: KLAX,
        t0: at(9, 40),
        t1: at(11, 40),
        s1: at(9, 59, 55),
        cruiseFt: 36000,
        ...profile,
      }),
    ];
    out['turnaround.json'] = toTrace({ icao: 'f00009', r: 'N14142', t: 'A319', cs: 'ACA777', cat: 'A3' }, pts);
  }

  return out;
}

function main(): void {
  const dir = new URL('./traces/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const [name, tr] of Object.entries(generateFixtures())) {
    const { trace, ...head } = tr;
    const body = `${JSON.stringify(head).slice(0, -1)},"trace":[\n${trace.map((p) => JSON.stringify(p)).join(',\n')}\n]}\n`;
    writeFileSync(new URL(name, dir), body);
  }
  console.log(`wrote fixtures to ${fileURLToPath(dir)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
