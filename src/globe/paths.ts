import {
  Cartesian3,
  Color,
  PolylineGlowMaterialProperty,
  type Entity,
  type Viewer,
} from 'cesium';
import type { Flight } from '../types/flight';

const PATH_ID_PREFIX = 'path-';

export function clearFlightPaths(viewer: Viewer): void {
  const entitiesToRemove = viewer.entities.values.filter((entity) =>
    typeof entity.id === 'string' ? entity.id.startsWith(PATH_ID_PREFIX) : false,
  );

  entitiesToRemove.forEach((entity) => {
    viewer.entities.remove(entity);
  });
}

export function drawFlightPath(viewer: Viewer, flight: Flight): Entity | null {
  clearFlightPaths(viewer);
  const points = flight.track;
  if (!points || points.length < 2) return null;

  return viewer.entities.add({
    id: `${PATH_ID_PREFIX}${flight.icao24}`,
    polyline: {
      positions: Cartesian3.fromDegreesArrayHeights(points.flatMap((point) => [
        point.longitude, point.latitude, Math.max(100, point.altitude),
      ])),
      width: 4,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Color.WHITE.withAlpha(0.9),
      }),
    },
  });
}
