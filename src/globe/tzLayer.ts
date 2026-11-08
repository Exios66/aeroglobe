import {
  Cartesian3,
  Color,
  ScreenSpaceEventType,
  type Entity,
  type ScreenSpaceEventHandler,
  type Viewer,
} from 'cesium';
import { zonesFromTopo, type TzZone, zoneAt, zoneLocalTime, type TopoJson } from './topojson';
import { greatCirclePoints } from '../utils/geo';

/** Per-viewer overlay state: drawn zone polygons, tick primitives, and the hover handler index. */
interface ViewerOverlay {
  zoneEntities: Entity[];
  tickEntities: Entity[];
  hoverEnabled: boolean;
}

const overlays = new WeakMap<Viewer, ViewerOverlay>();

const moduleState = {
  zones: null as TzZone[] | null,
  loading: false,
  error: null as string | null,
};

let loadPromise: Promise<TzZone[]> | null = null;

export type TzOverlayPhase = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Loads the simplified time-zone TopoJSON once; loads are shared while in flight, a failure
 * clears the memoised attempt so a later toggle can retry (spec §7: the overlay is optional,
 * never blocking).
 */
export function loadTzZones(baseUrl: string): Promise<TzZone[]> {
  if (moduleState.zones) return Promise.resolve(moduleState.zones);
  if (!loadPromise) {
    loadPromise = (async () => {
      const response = await fetch(`${baseUrl}ref/timezones.topo.json`, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`time-zone data request failed with status ${response.status}`);
      const topo = (await response.json()) as TopoJson;
      return zonesFromTopo(topo);
    })();
    loadPromise
      .then((zones) => {
        moduleState.zones = zones;
        moduleState.loading = false;
        moduleState.error = null;
        return zones;
      })
      .catch((error) => {
        moduleState.loading = false;
        moduleState.error = error instanceof Error ? error.message : 'time-zone overlay unavailable';
        loadPromise = null;
      });
    moduleState.loading = true;
  }
  return loadPromise;
}

export function tzLoadState(): { phase: TzOverlayPhase; zones: number | null } {
  if (moduleState.zones) return { phase: 'ready', zones: moduleState.zones.length };
  if (moduleState.loading) return { phase: 'loading', zones: null };
  return { phase: moduleState.error ? 'error' : 'idle', zones: null };
}

function overlayFor(viewer: Viewer): ViewerOverlay {
  let overlay = overlays.get(viewer);
  if (!overlay) {
    overlay = { zoneEntities: [], tickEntities: [], hoverEnabled: false };
    overlays.set(viewer, overlay);
  }
  return overlay;
}

function drawZoneEntities(viewer: Viewer, zones: TzZone[]): void {
  const overlay = overlayFor(viewer);
  for (const entity of overlay.zoneEntities) viewer.entities.remove(entity);
  overlay.zoneEntities = zones.map((zone, index) => {
    // Alternating cool tints separate neighbouring zones while staying readable over imagery.
    const fill = Color.fromCssColorString(index % 2 === 0 ? '#22d3ee' : '#6366f1').withAlpha(0.1);
    const entity = viewer.entities.add({
      id: `tz-zone-${index}-${zone.tzid}`,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(zone.outer.flat()),
        material: fill,
      },
      properties: { tzid: zone.tzid },
    });
    return entity;
  });
}

function clearZoneEntities(viewer: Viewer): void {
  const overlay = overlays.get(viewer);
  if (!overlay) return;
  for (const entity of overlay.zoneEntities) viewer.entities.remove(entity);
  overlay.zoneEntities = [];
}

/** Turns the floating zone chip into a hover handler only while the overlay is on. */
export function setTzHoverListener(
  viewer: Viewer,
  onHover: (hover: { tzid: string; local: string } | null) => void,
): void {
  const overlay = overlayFor(viewer);
  if (overlay.hoverEnabled) return;
  overlay.hoverEnabled = true;
  const handler = viewer.screenSpaceEventHandler;
  handler.setInputAction((movement: ScreenSpaceEventHandler.PositionedEvent) => {
    const hasPosition = typeof movement.position?.x === 'number';
    if (!hasPosition) return;
    const picked = viewer.scene.pick(movement.position);
    const props = (picked?.id as { properties?: { getValue?: (t: unknown) => Record<string, unknown> } })?.properties;
    const tzid: unknown = props?.getValue?.(viewer.clock.currentTime)?.tzid;
    if (typeof tzid === 'string') {
      const local = zoneLocalTime(tzid, new Date());
      onHover(local ? { tzid, local } : { tzid, local: '--:--' });
      return;
    }
    onHover(null);
  }, ScreenSpaceEventType.MOUSE_MOVE);
}

/** Draws every loaded zone as a subtle drape; a no-op when already shown. */
export function showTzOverlay(viewer: Viewer): void {
  if (!moduleState.zones) return;
  if (overlayFor(viewer).zoneEntities.length) return;
  drawZoneEntities(viewer, moduleState.zones);
  setTzHoverListener(viewer, (hover) => {
    void import('../store').then(({ useUiStore }) => useUiStore.getState().setTzHover(hover));
  });
}

/** Removes zones, ticks, and the hover watcher. */
export function hideTzOverlay(viewer: Viewer): void {
  clearZoneEntities(viewer);
  const overlay = overlays.get(viewer);
  if (!overlay) return;
  for (const entity of overlay.tickEntities) viewer.entities.remove(entity);
  overlay.tickEntities = [];
  if (overlay.hoverEnabled) {
    overlay.hoverEnabled = false;
    // Cesium's handler keeps actions keyed by type; replacing the action with an empty one
    // is the cheapest way to disable hover handling without recreating the handler.
    viewer.screenSpaceEventHandler.setInputAction(() => undefined, ScreenSpaceEventType.MOUSE_MOVE);
  }
}

/** Direct tick drawing under full test control — the hook calls this on selection changes. */
export function drawTzTicks(viewer: Viewer, crossings: [number, number][]): void {
  const overlay = overlayFor(viewer);
  for (const entity of overlay.tickEntities) viewer.entities.remove(entity);
  overlay.tickEntities = crossings.map(([lon, lat], index) => {
    // A short "gate" segment perpendicular to the route: a marker a pilot's eye reads as a
    // boundary crossing rather than clutter.
    return viewer.entities.add({
      id: `tz-tick-${index}`,
      polyline: {
        positions: Cartesian3.fromDegreesArray([
          lon - 0.35, lat - 0.35,
          lon + 0.35, lat + 0.35,
        ]),
        width: 2.5,
        material: Color.fromCssColorString('#f9fafb').withAlpha(0.9),
      },
    });
  });
}

/** Clears only the route ticks (zones stay when toggled on). */
export function clearTzTicks(viewer: Viewer): void {
  const overlay = overlays.get(viewer);
  if (!overlay) return;
  for (const entity of overlay.tickEntities) viewer.entities.remove(entity);
  overlay.tickEntities = [];
}

/** Number of time-zone boundaries a route crosses, sampled along its great circle. */
export function tzBoundaryCrossings(
  origin: [number, number] | undefined,
  destination: [number, number] | undefined,
  zones: TzZone[],
  samples = 96,
): [number, number][] {
  if (!origin || !destination || zones.length === 0) return [];
  const points = greatCirclePoints(origin, destination, samples);
  const crossings: [number, number][] = [];
  let previousTzid = zoneAt(points[0][0], points[0][1], zones)?.tzid ?? null;
  for (let index = 1; index < points.length; index++) {
    const [lon, lat] = points[index];
    const currentTzid = zoneAt(lon, lat, zones)?.tzid ?? null;
    if (currentTzid && previousTzid && currentTzid !== previousTzid) {
      crossings.push([lon, lat]);
    }
    previousTzid = currentTzid;
  }
  return crossings;
}
