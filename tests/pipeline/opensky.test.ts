// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { rowToTrace, snapshotsToTraceSource, type OpenSkySnapshot } from '../../pipeline/sources/opensky';
import { normalizeTrace } from '../../pipeline/normalize';

// [icao24, callsign, country, time_position, last_contact, lon, lat, baro_alt_m, on_ground, velocity_m_s, true_track, ...]
const airborneRow = ['3c6444', 'DLH123  ', 'Germany', 1000, 1001, 8.5, 50.1, 10000, false, 250, 90, 0, null, 10200];
const groundRow = ['abc123', 'UAL1    ', 'United States', 1000, 1002, -73.7, 40.6, null, true, 0, 0, 0, null, 0];
const noPositionRow = ['def456', 'BAW1    ', 'United Kingdom', 1000, 1003, null, null, 9000, false, 230, 180, 0, null, 9000];

describe('rowToTrace', () => {
  it('maps an airborne state to feet, knots, and degrees with the callsign in details', () => {
    const trace = rowToTrace(airborneRow, 999);
    expect(trace).toMatchObject({ icao: '3c6444', timestamp: 1001 });
    const p = trace!.trace[0];
    expect(p[0]).toBe(0);
    expect(p[1]).toBeCloseTo(50.1);
    expect(p[2]).toBeCloseTo(8.5);
    expect(p[3]).toBeCloseTo(32808.4, 1);
    expect(p[4]).toBeCloseTo(485.96, 1);
    expect(p[5]).toBe(90);
    expect(p[8]).toEqual({ flight: 'DLH123' });
  });

  it('marks ground rows as "ground" even though OpenSky leaves altitude unset', () => {
    const trace = rowToTrace(groundRow, 999);
    expect(trace!.trace[0][3]).toBe('ground');
  });

  it('rejects rows without a position, with a bad hex id, or without altitude', () => {
    expect(rowToTrace(noPositionRow, 999)).toBeNull();
    expect(rowToTrace(['not-hex!', 'X', 'US', 1, 2, 0, 0, 1000, false, 1, 2], 999)).toBeNull();
    expect(rowToTrace(['abc123', 'X', 'US', 1, 2, 0, 0, null, false, 1, 2], 999)).toBeNull();
  });

  it('falls back to the snapshot time when last contact is missing', () => {
    const trace = rowToTrace(['abc123', 'X', 'US', 1, null, 0, 0, 1000, false, 1, 2], 1234);
    expect(trace!.timestamp).toBe(1234);
  });
});

describe('snapshotsToTraceSource', () => {
  const snap = (time: number, rows: unknown[][]): OpenSkySnapshot => ({ time, states: rows });

  async function collect(snapshots: OpenSkySnapshot[]) {
    const source = snapshotsToTraceSource(snapshots, { name: 'opensky', attribution: 'test', minSpacingS: 0 });
    const out = [];
    for await (const t of source.traces('2026-10-12')) out.push(t);
    return out.sort((a, b) => (a.icao < b.icao ? -1 : 1));
  }

  it('merges repeated snapshots into one trace per aircraft, with the newest point last', async () => {
    const traces = await collect([
      snap(1000, [airborneRow]),
      snap(1100, [
        ['3c6444', 'DLH123  ', 'Germany', 1100, 1100, 8.6, 50.2, 10100, false, 250, 91, 0, null, 10300],
      ]),
    ]);
    expect(traces).toHaveLength(1);
    expect(traces[0].trace).toHaveLength(2);
    expect(traces[0].trace[1][0]).toBe(99);
    expect(traces[0].trace[1][1]).toBeCloseTo(50.2);
  });

  it('enforces the minimum spacing between kept points', async () => {
    const source = snapshotsToTraceSource(
      [snap(1000, [airborneRow]), snap(1010, [['3c6444', 'DLH123', 'DE', 1010, 1010, 8.6, 50.2, 10100, false, 250, 91, 0, null, 10300]])],
      { name: 'opensky', attribution: 'test', minSpacingS: 300 },
    );
    for await (const t of source.traces('2026-10-12')) expect(t.trace).toHaveLength(1);
  });

  it('produces traces that normalize into usable tracks', async () => {
    const traces = await collect([snap(1000, [airborneRow, groundRow])]);
    const normalized = traces.map(normalizeTrace).filter((t) => t !== null);
    expect(normalized).toHaveLength(2);
    const ground = normalized.find((t) => t!.id === 'abc123')!;
    expect(ground.points[0].ground).toBe(true);
    expect(ground.points[0].cs).toBe('UAL1');
  });
});
