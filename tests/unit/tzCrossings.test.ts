import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { zonesFromTopo, type TopoJson } from '../../src/globe/topojson';
import { tzBoundaryCrossings } from '../../src/globe/tzLayer';

function zones(): ReturnType<typeof zonesFromTopo> {
  return zonesFromTopo(JSON.parse(
    readFileSync(join(process.cwd(), 'public/data/ref/timezones.topo.json'), 'utf8'),
  ) as TopoJson);
}

describe('tzBoundaryCrossings', () => {
  const { zones: loaded } = { zones: zones() };

  it('finds the Chicago -> Denver boundary on an ORD-DEN route', () => {
    const crossings = tzBoundaryCrossings([-87.9, 41.98], [-104.67, 39.86], loaded);
    expect(crossings.length).toBeGreaterThanOrEqual(1);
  });

  it('reports none inside a single zone and no zones at all', () => {
    // KORD -> KMDW both inside the Chicago cone.
    expect(tzBoundaryCrossings([-87.9, 41.98], [-87.75, 41.78], loaded)).toEqual([]);
    expect(tzBoundaryCrossings([-87.9, 41.98], [-104.67, 39.86], [])).toEqual([]);
  });

  it('degrades safely for missing endpoints', () => {
    expect(tzBoundaryCrossings(undefined, [-104.67, 39.86], loaded)).toEqual([]);
    expect(tzBoundaryCrossings([-87.9, 41.98], undefined, loaded)).toEqual([]);
  });
});
