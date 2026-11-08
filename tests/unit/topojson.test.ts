import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeArc,
  pointInZone,
  type TopoJson,
  zoneAt,
  zoneLocalTime,
  zonesFromTopo,
} from '../../src/globe/topojson';

const fixtureFixture = (): TopoJson => JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/ref/timezones.topo.json'), 'utf8'),
) as TopoJson;

describe('zonesFromTopo', () => {
  it('decodes the fixture zones with lon/lat outer rings in Winnipeg-projection-free degrees', () => {
    const zones = zonesFromTopo(fixtureFixture());
    expect(zones.map((zone) => zone.tzid).sort()).toEqual(['America/Chicago', 'America/Denver']);
    for (const zone of zones) {
      expect(zone.outer.length).toBeGreaterThanOrEqual(4);
      for (const [lon, lat] of zone.outer) {
        expect(lon).toBeGreaterThanOrEqual(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(lat).toBeGreaterThanOrEqual(-90);
        expect(lat).toBeLessThanOrEqual(90);
      }
    }
  });

  it('drops degenerate zones that cannot form a polygon', () => {
    const topo = fixtureFixture();
    topo.objects.timezones.geometries.push({
      type: 'Polygon',
      arcs: [[-1]],
      properties: { tzid: 'Pacific/Empty' },
    });
    const zones = zonesFromTopo(topo);
    expect(zones.some((zone) => zone.tzid === 'Pacific/Empty')).toBe(false);
  });
});

describe('decodeArc', () => {
  it('delta-decodes quantized arcs with the transform back into degrees', () => {
    const topo = fixtureFixture();
    const decoded = decodeArc(topo, 0);
    // tz-boundary-builder encodes lon/lat deltas quantized by scale ≈ [360/2^w, 180/2^h].
    expect(decoded[0]).toEqual([
      topo.transform!.translate[0] + topo.arcs[0][0][0] * topo.transform!.scale[0],
      topo.transform!.translate[1] + topo.arcs[0][0][1] * topo.transform!.scale[1],
    ]);
  });
});

describe('pointInZone / zoneAt', () => {
  const zones = zonesFromTopo(fixtureFixture());

  it('classifies points inside either cone, including edge behaviour', () => {
    expect(zoneAt(-87.9, 41.98, zones)?.tzid).toBe('America/Chicago');
    expect(zoneAt(-104.67, 39.86, zones)?.tzid).toBe('America/Denver');
    expect(zoneAt(2.35, 48.85, zones)).toBeNull();
  });

  it('ray-casts consistently above and below the boundary line', () => {
    const zone = zones.find((candidate) => candidate.tzid === 'America/Chicago')!;
    expect(pointInZone(zone.outer[0][0], zone.outer[0][1], zone)).toBe(true);
  });
});

describe('zoneLocalTime', () => {
  it('formats wall-clock times and rejects unknown zones', () => {
    expect(zoneLocalTime('America/Chicago', new Date('2026-10-12T13:45:00Z'))).toBe('08:45');
    expect(zoneLocalTime('Not/AZone', new Date('2026-10-12T13:45:00Z'))).toBeNull();
  });
});
