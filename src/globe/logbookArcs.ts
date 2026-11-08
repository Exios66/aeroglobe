import { Cartesian3, Color, type Entity, type Viewer } from 'cesium';
import { greatCirclePoints } from '../utils/geo';

/**
 * Elevated great-circle arcs for every logbook entry with known airports (spec §6.7).
 * Arcs use a parabolic altitude profile so dense routes stay readable without lying about
 * cruise altitude — they are memories, not flight data.
 */

const ARC_PEAK_KM = 180;
interface ArcState {
  arcs: Entity[];
}

const stateByViewer = new WeakMap<Viewer, ArcState>();

function stateFor(viewer: Viewer): ArcState {
  let state = stateByViewer.get(viewer);
  if (!state) {
    state = { arcs: [] };
    stateByViewer.set(viewer, state);
  }
  return state;
}

export function syncLogbookArcs(
  viewer: Viewer,
  entries: { depIcao: string | null; arrIcao: string | null; id: string; date: string }[],
  coordinatesFor: (icao: string) => [number, number] | undefined,
): void {
  const state = stateFor(viewer);
  for (const arc of state.arcs) viewer.entities.remove(arc);
  state.arcs = [];

  for (const entry of entries) {
    const origin = entry.depIcao ? coordinatesFor(entry.depIcao) : undefined;
    const destination = entry.arrIcao ? coordinatesFor(entry.arrIcao) : undefined;
    if (!origin || !destination) continue;

    const points = greatCirclePoints(origin, destination, 64);
    state.arcs.push(viewer.entities.add({
      id: `logbook-arc-${entry.id}`,
      polyline: {
        positions: points.map(([lon, lat], index) => {
          const phase = Math.sin((Math.PI * index) / Math.max(1, points.length - 1));
          const heightKm = ARC_PEAK_KM * phase * phase;
          return Cartesian3.fromDegrees(lon, lat, heightKm * 1000);
        }),
        width: 1.6,
        material: Color.fromCssColorString('#A5B4FC').withAlpha(0.45),
      },
    }));
  }
}

export function clearLogbookArcs(viewer: Viewer): void {
  const state = stateByViewer.get(viewer);
  if (!state) return;
  for (const arc of state.arcs) viewer.entities.remove(arc);
  state.arcs = [];
}
