/**
 * Minimal TopoJSON reader for the simplified time-zone polygons published by the data
 * pipeline (`ref/timezones.topo.json`). Supports quantized delta-encoded arcs, the classic
 * "negative arc index = reversed" convention, and Polygon / MultiPolygon geometries —
 * which is all the tz-boundary-builder output uses.
 */
export interface TopoJson {
  type: 'Topology';
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { geometries: TopoGeometry[] }>;
}

interface TopoGeometry {
  type: 'Polygon' | 'MultiPolygon';
  arcs: number[][] | number[][][];
  properties: { tzid: string };
}

/** A decoded time-zone outline: lon/lat degree pairs. */
export interface TzZone {
  tzid: string;
  /** Exterior boundary ring. */
  outer: [number, number][];
  /** Interior rings (holes), if any. */
  holes: [number, number][][];
}

/** Decodes one arc into a lon/lat polyline, applying the transform and delta accumulation. */
export function decodeArc(topo: TopoJson, index: number): [number, number][] {
  const arc = topo.arcs[index];
  if (!arc) return [];
  const scale = topo.transform?.scale;
  const translate = topo.transform?.translate;
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    if (scale && translate) {
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]] as [number, number];
    }
    return [x, y] as [number, number];
  });
}

function ringFromArcIndexes(topo: TopoJson, indexes: number[]): [number, number][] {
  const points: [number, number][] = [];
  for (const index of indexes) {
    const decoded = index >= 0
      ? decodeArc(topo, index)
      : decodeArc(topo, ~index).slice().reverse();
    // Contiguous arcs share endpoints; drop the first point when continuing a ring.
    for (const point of decoded.slice(points.length ? 1 : 0)) {
      points.push(point);
    }
  }
  return points;
}

export function zonesFromTopo(topo: TopoJson): TzZone[] {
  const zones: TzZone[] = [];
  for (const geometry of topo.objects.timezones?.geometries ?? []) {
    if (!geometry.properties?.tzid) continue;
    if (geometry.type === 'Polygon') {
      const [outer, ...holes] = geometry.arcs as number[][];
      zones.push({
        tzid: geometry.properties.tzid,
        outer: ringFromArcIndexes(topo, outer ?? []),
        holes: (holes ?? []).map((ring) => ringFromArcIndexes(topo, ring)),
      });
    } else if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.arcs as number[][][]) {
        const [outer, ...holes] = polygon;
        zones.push({
          tzid: geometry.properties.tzid,
          outer: ringFromArcIndexes(topo, outer ?? []),
          holes: (holes ?? []).map((ring) => ringFromArcIndexes(topo, ring)),
        });
      }
    }
  }
  // Degenerate rings (fewer than 3 points) cannot form polygons; drop them.
  return zones.filter((zone) => zone.outer.length >= 4);
}

/**
 * Ray-casting point-in-polygon over the zone's exterior ring (holes ignored — they are
 * coarse decorations in the simplified output, not exclusion zones).
 */
export function pointInZone(lon: number, lat: number, zone: TzZone): boolean {
  const ring = zone.outer;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** The zone containing a point, or null (searched in list order — coarse but cheap). */
export function zoneAt(
  lon: number,
  lat: number,
  zones: TzZone[],
): TzZone | null {
  for (const zone of zones) if (pointInZone(lon, lat, zone)) return zone;
  return null;
}

/** Formats the wall-clock time for a time-zone id at the given instant, empty when unknown. */
export function zoneLocalTime(tzid: string, date: Date = new Date()): string | null {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tzid,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return null;
  }
}
