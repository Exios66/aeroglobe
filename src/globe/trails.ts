import { Cartesian3, Color, Material, PolylineCollection, type Polyline, type Viewer } from 'cesium';
import type { Flight, FlightTrackPoint } from '../types/flight';

// Keep the globe responsive with worldwide datasets. Prioritize the camera's nearest tracks.
export const MAX_VISIBLE_TRAILS = 2000;
const MAX_TRAIL_POINTS = 96;
const collections = new WeakMap<Viewer, {
  collection: PolylineCollection;
  lines: Map<string, { line: Polyline; track: FlightTrackPoint[]; selected: boolean }>;
}>();

function trailPositions(track: FlightTrackPoint[]): Cartesian3[] {
  const step = Math.max(1, Math.ceil((track.length - 1) / (MAX_TRAIL_POINTS - 1)));
  const points = track.filter((_, i) => i % step === 0 || i === track.length - 1);
  return points.map((point) => Cartesian3.fromDegrees(point.longitude, point.latitude, Math.max(100, point.altitude)));
}

/** Draws actual observed tracks. Single observations never become invented routes. */
export function syncFlightTrails(viewer: Viewer, flights: Flight[], selectedFlightId: string | null): void {
  let state = collections.get(viewer);
  if (!state) {
    state = { collection: viewer.scene.primitives.add(new PolylineCollection()), lines: new Map() };
    collections.set(viewer, state);
  }

  const candidates = flights.filter((flight) => flight.track && flight.track.length >= 2);
  if (candidates.length > MAX_VISIBLE_TRAILS) {
    const camera = viewer.camera.positionWC;
    candidates.sort((a, b) => {
      if (a.icao24 === selectedFlightId) return -1;
      if (b.icao24 === selectedFlightId) return 1;
      const aPosition = Cartesian3.fromDegrees(a.longitude, a.latitude);
      const bPosition = Cartesian3.fromDegrees(b.longitude, b.latitude);
      return Cartesian3.distanceSquared(camera, aPosition) - Cartesian3.distanceSquared(camera, bPosition);
    });
    candidates.length = MAX_VISIBLE_TRAILS;
  }
  const ids = new Set(candidates.map((flight) => flight.icao24));
  for (const [id, item] of state.lines) {
    if (!ids.has(id)) {
      state.collection.remove(item.line);
      state.lines.delete(id);
    }
  }
  for (const flight of candidates) {
    const track = flight.track!;
    const selected = flight.icao24 === selectedFlightId;
    const existing = state.lines.get(flight.icao24);
    if (existing?.track === track && existing.selected === selected) continue;
    if (existing) state.collection.remove(existing.line);
    const line = state.collection.add({
      id: { id: `flight-${flight.icao24}` },
      positions: trailPositions(track),
      width: selected ? 4 : 2,
      material: Material.fromType('PolylineGlow', {
        color: (selected ? Color.WHITE : Color.CYAN).withAlpha(selected ? 0.95 : 0.7),
        glowPower: selected ? 0.25 : 0.12,
      }),
    });
    state.lines.set(flight.icao24, { line, track, selected });
  }
}

export function clearFlightTrails(viewer: Viewer): void {
  const state = collections.get(viewer);
  if (state && !viewer.isDestroyed()) viewer.scene.primitives.remove(state.collection);
  collections.delete(viewer);
}
