// @vitest-environment node
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeTrace } from '../../pipeline/normalize';
import { parseTraceFile, type ReadsbTrace } from '../../pipeline/readsb';
import { FIXTURE_DATE, generateFixtures } from '../../pipeline/fixtures/generate';

const fx = generateFixtures();
const DAY0 = Date.parse(`${FIXTURE_DATE}T00:00:00Z`) / 1000;
const hourOf = (t: number) => Math.floor((t - DAY0) / 3600);

function mk(rows: unknown[][], extra: Partial<ReadsbTrace> = {}): ReadsbTrace {
  return { icao: 'abc123', timestamp: 1000, trace: rows, ...extra };
}

describe('parseTraceFile', () => {
  it.each([Buffer.alloc(0), Buffer.from('{invalid'), Buffer.from([0x1f, 0x8b, 0])])(
    'rejects malformed JSON or gzip: %j',
    (buf) => expect(() => parseTraceFile(buf)).toThrow(),
  );
  const json = JSON.stringify(fx['groundonly.json']);
  it('reads plain JSON', () => {
    expect(parseTraceFile(Buffer.from(json)).icao).toBe('f00004');
  });
  it('reads gzipped JSON', () => {
    const tr = parseTraceFile(gzipSync(Buffer.from(json)));
    expect(tr.icao).toBe('f00004');
    expect(tr.trace.length).toBe(fx['groundonly.json'].trace.length);
  });
});

describe('committed fixtures', () => {
  it('match generateFixtures() exactly', () => {
    for (const [name, tr] of Object.entries(fx)) {
      const disk = parseTraceFile(readFileSync(new URL(`../../pipeline/fixtures/traces/${name}`, import.meta.url)));
      expect(disk).toEqual(JSON.parse(JSON.stringify(tr)));
    }
  });
  it('has the agreed ids', () => {
    const ids = Object.fromEntries(Object.entries(fx).map(([k, v]) => [k.replace('.json', ''), v.icao]));
    expect(ids).toEqual({
      normal: 'f00001',
      multileg: 'f00002',
      gap: 'f00003',
      groundonly: 'f00004',
      antimeridian: 'f00005',
      nonicao: '~abc123',
      glitch: 'f00006',
      hourboundary: 'f00007',
      midnight: 'f00008',
      turnaround: 'f00009',
    });
  });
});

describe('normalizeTrace', () => {
  it('sorts out-of-order rows and keeps the first usable sample in each rounded second', () => {
    const track = normalizeTrace(mk([
      [10, 1, 1, 300, 100, 90],
      [0.2, null, 1, 100, 100, 90],
      [0.3, 1, 1, 200, 100, 90],
      [0.4, 1, 1, 999, 100, 90],
    ]))!;
    expect(track.points.map(({ t, altFt }) => [t, altFt])).toEqual([[1000, 200], [1010, 300]]);
  });

  it.each([[91, 0], [-90.5, 0], [0, 181], [0, -180.5]])('drops out-of-range coordinates %s,%s', (lat, lon) => {
    const track = normalizeTrace(mk([[0, lat, lon, 100, 50, 90], [10, 1, 1, 100, 50, 90]]))!;
    expect(track.points.map((p) => p.t)).toEqual([1010]);
  });

  it('carries callsigns from rejected rows without carrying their speed or heading', () => {
    const track = normalizeTrace(mk([
      [0, 1, 1, 100, 50, 90, 0, 0, { flight: 'OLD1' }],
      [5, 50, 50, 100, 999, 270, 0, 0, { flight: ' NEW2 ' }],
      [10, 1, 1, 100, null, null],
    ]))!;
    expect(track.points).toHaveLength(2);
    expect(track.points[1]).toMatchObject({ cs: 'NEW2', gsKt: 50, trk: 90 });
  });

  it('carries a callsign update from a duplicate timestamp into subsequent points', () => {
    const track = normalizeTrace(mk([
      [0, 1, 1, 100, 50, 90, 0, 0, { flight: 'OLD1' }],
      [0.1, 1, 1, 200, 999, 270, 0, 0, { flight: 'NEW2' }],
      [10, 1, 1, 100, null, null],
    ]))!;
    expect(track.points.map(({ cs }) => cs)).toEqual(['OLD1', 'NEW2']);
    expect(track.points[1]).toMatchObject({ gsKt: 50, trk: 90 });
  });

  it.each([NaN, Infinity, -Infinity, '1', null])('rejects non-finite or nonnumeric values: %s', (bad) => {
    expect(normalizeTrace(mk([[bad, 1, 1, 100]]))).toBeNull();
    expect(normalizeTrace(mk([[0, bad, 1, 100]]))).toBeNull();
    expect(normalizeTrace(mk([[0, 1, bad, 100]]))).toBeNull();
    expect(normalizeTrace(mk([[0, 1, 1, bad]]))).toBeNull();
    const track = normalizeTrace(mk([[0, 1, 1, 100, bad, bad]]))!;
    expect(track.points[0]).toMatchObject({ gsKt: 0, trk: 0 });
  });

  it('drops a surface vehicle even when its category appears in a later row', () => {
    expect(normalizeTrace(mk([
      [0, 1, 1, 'ground'],
      [10, 1, 1, 'ground', 0, 0, 0, 0, { category: 'C2' }],
    ]))).toBeNull();
  });

  it('accepts an empty trace as no usable aircraft', () => {
    expect(normalizeTrace(mk([]))).toBeNull();
  });

  it('drops non-ICAO ids', () => {
    expect(normalizeTrace(fx['nonicao.json'])).toBeNull();
  });
  it('drops category C* aircraft', () => {
    expect(normalizeTrace(mk([[0, 1, 1, 100, 10, 90, 0, 0, { category: 'C1' }]]))).toBeNull();
  });
  it('maps ground altitude to ground:true, altFt:null', () => {
    const rt = normalizeTrace(mk([[0, 1, 1, 'ground', 5, 90, 0, 0, null], [5, 1, 1.001, 500, 80, 90, 0, 0, null]]))!;
    expect(rt.points[0]).toMatchObject({ ground: true, altFt: null });
    expect(rt.points[1]).toMatchObject({ ground: false, altFt: 500 });
  });
  it('clamps negative airborne altitude to 0', () => {
    const rt = normalizeTrace(mk([[0, 1, 1, -20, 5, 90, 0, 0, null]]))!;
    expect(rt.points[0].altFt).toBe(0);
    expect(rt.points[0].ground).toBe(false);
  });
  it('normalises track into [0, 360)', () => {
    const rt = normalizeTrace(
      mk([
        [0, 1, 1, 100, 5, -10, 0, 0, null],
        [5, 1, 1.0001, 100, 5, 370, 0, 0, null],
        [10, 1, 1.0002, 100, 5, 360, 0, 0, null],
      ]),
    )!;
    expect(rt.points.map((p) => p.trk)).toEqual([350, 10, 0]);
  });
  it('removes the single glitch point', () => {
    const raw = fx['glitch.json'].trace.length;
    const rt = normalizeTrace(fx['glitch.json'])!;
    expect(rt.points.length).toBe(raw - 1);
  });
  it('keeps every antimeridian point', () => {
    const rt = normalizeTrace(fx['antimeridian.json'])!;
    expect(rt.points.length).toBe(fx['antimeridian.json'].trace.length);
    expect(rt.points.some((p) => p.lon > 179)).toBe(true);
    expect(rt.points.some((p) => p.lon < -179)).toBe(true);
  });
  it('collapses fractional same-second duplicates', () => {
    const rt = normalizeTrace(
      mk([
        [0, 1, 1, 100, 5, 90, 0, 0, null],
        [0.4, 1, 1, 100, 5, 90, 0, 0, null],
        [5.3, 1, 1.0001, 100, 5, 90, 0, 0, null],
        [4.9, 1, 1.00005, 100, 5, 90, 0, 0, null],
      ]),
    )!;
    expect(rt.points.map((p) => p.t)).toEqual([1000, 1005]);
  });
  it('collapses duplicates in the normal fixture', () => {
    const rt = normalizeTrace(fx['normal.json'])!;
    expect(rt.points.length).toBe(fx['normal.json'].trace.length - 1);
    const ts = rt.points.map((p) => p.t);
    expect(new Set(ts).size).toBe(ts.length);
  });
  it('trims callsigns, carries them forward, and maps empty to null', () => {
    const rt = normalizeTrace(
      mk([
        [0, 1, 1, 100, 5, 90, 0, 0, { flight: 'UAL123  ', category: 'A3' }],
        [5, 1, 1.0001, 100, 5, 90, 0, 0, null],
        [10, 1, 1.0002, 100, 5, 90, 0, 0, { flight: '        ' }],
        [15, 1, 1.0003, 100, 5, 90, 0, 0, null],
      ]),
    )!;
    expect(rt.points.map((p) => p.cs)).toEqual(['UAL123', 'UAL123', null, null]);
    expect(rt.category).toBe('A3');
  });
  it('carries null gs/track and starts at 0; drops null lat/lon and null airborne alt', () => {
    const rt = normalizeTrace(
      mk([
        [0, 1, 1, 100, null, null, 0, 0, null],
        [5, 1, 1.0001, 100, 200, 45, 0, 0, null],
        [10, 1, 1.0002, 100, null, null, 0, 0, null],
        [15, null, 1.0003, 100, 1, 1, 0, 0, null],
        [20, 1, 1.0004, null, 1, 1, 0, 0, null],
      ]),
    )!;
    expect(rt.points.map((p) => [p.gsKt, p.trk])).toEqual([
      [0, 0],
      [200, 45],
      [200, 45],
    ]);
  });
  it('returns null when no points survive', () => {
    expect(normalizeTrace(mk([[0, null, null, 100, 1, 1, 0, 0, null]]))).toBeNull();
  });
  it('maps reg/type from the trace', () => {
    const rt = normalizeTrace(fx['normal.json'])!;
    expect(rt).toMatchObject({ id: 'f00001', reg: 'N12345', type: 'B738', category: 'A3' });
  });
});

describe('fixture scenario facts', () => {
  const rt = (n: string) => normalizeTrace(fx[`${n}.json`])!;
  const runs = (n: string) => {
    const out: boolean[] = [];
    for (const p of rt(n).points) if (out[out.length - 1] !== p.ground) out.push(p.ground);
    return out;
  };

  it('normal: ground-air-ground, FL370 cruise, hours 3-5, UAL123', () => {
    const t = rt('normal');
    expect(runs('normal')).toEqual([true, false, true]);
    const air = t.points.filter((p) => !p.ground);
    expect(Math.max(...air.map((p) => p.altFt!))).toBe(37000);
    expect([...new Set(air.map((p) => hourOf(p.t)))]).toEqual([3, 4, 5]);
    expect(air[0].t).toBe(DAY0 + 3 * 3600 + 600);
    expect(air[air.length - 1].t).toBe(DAY0 + 5 * 3600 + 1200);
    expect(air[0].altFt!).toBeLessThan(6000);
    expect(t.points.every((p) => p.cs === 'UAL123')).toBe(true);
  });
  it('multileg: two airborne runs each with ground ends, ~40 min at KDEN', () => {
    expect(runs('multileg')).toEqual([true, false, true, false, true]);
    const pts = rt('multileg').points;
    const mid = pts.filter((p) => p.ground && p.t > DAY0 + 10 * 3600);
    expect(mid[mid.length - 1].t - mid[0].t).toBeGreaterThanOrEqual(39 * 60);
  });
  it('gap: airborne only with a 45 min hole and 8000 ft drop', () => {
    const pts = rt('gap').points;
    expect(pts.every((p) => !p.ground)).toBe(true);
    const i = pts.findIndex((p, k) => k > 0 && p.t - pts[k - 1].t > 600);
    expect(pts[i].t - pts[i - 1].t).toBe(45 * 60);
    expect(pts[i - 1].altFt! - pts[i].altFt!).toBe(8000);
  });
  it('groundonly / hourboundary / midnight / turnaround shapes', () => {
    expect(runs('groundonly')).toEqual([true]);
    const hb = rt('hourboundary').points;
    expect(hb.every((p) => !p.ground)).toBe(true);
    expect([...new Set(hb.map((p) => hourOf(p.t)))]).toEqual([6, 7]);
    const mn = rt('midnight').points;
    expect(runs('midnight')).toEqual([true, false]);
    expect(mn[mn.length - 1].t).toBe(DAY0 + 86399);
    expect(runs('turnaround')).toEqual([false, true, false]);
    expect([...new Set(rt('turnaround').points.filter((p) => p.ground).map((p) => hourOf(p.t)))]).toEqual([9]);
  });
  it('is deterministic', () => {
    expect(JSON.stringify(generateFixtures())).toBe(JSON.stringify(fx));
  });
});
