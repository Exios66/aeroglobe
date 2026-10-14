// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTimezones } from '../../pipeline/timezones';

const FIXTURE = join(__dirname, '../../pipeline/fixtures/timezones.geojson');
const dir = mkdtempSync(join(tmpdir(), 'tz-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('buildTimezones', () => {
  it('builds a TopoJSON topology with tzid properties', async () => {
    const out = join(dir, 'tz.topo.json');
    const res = await buildTimezones(FIXTURE, out);
    const topo = JSON.parse(readFileSync(out, 'utf8'));
    expect(topo.type).toBe('Topology');
    const obj = Object.values(topo.objects)[0] as { geometries: { properties: { tzid: string } }[] };
    expect(obj.geometries).toHaveLength(2);
    expect(obj.geometries.map((g) => g.properties.tzid).sort()).toEqual(['America/Chicago', 'America/Denver']);
    expect(res.zones).toBe(2);
    expect(res.bytesGz).toBeGreaterThan(0);
  });

  it('throws when the gzipped size exceeds the limit', async () => {
    await expect(buildTimezones(FIXTURE, join(dir, 'big.json'), { maxBytesGz: 10 })).rejects.toThrow(/gz/);
  });
});
