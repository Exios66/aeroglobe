import {
  Cartesian3,
  Color,
  PolylineGlowMaterialProperty,
  type Entity,
  type Viewer,
} from 'cesium';
import type { Flight } from '../types/flight';
import { greatCirclePoints } from '../utils/geo';

const PATH_ID_PREFIX = 'path-';

function toDegreesArray(points: [number, number][]): number[] {
  return points.flatMap(([longitude, latitude]) => [longitude, latitude]);
}

export function clearFlightPaths(viewer: Viewer): void {
  const entitiesToRemove = viewer.entities.values.filter((entity) =>
    typeof entity.id === 'string' ? entity.id.startsWith(PATH_ID_PREFIX) : false,
  );

  entitiesToRemove.forEach((entity) => {
    viewer.entities.remove(entity);
  });
}

export function drawFlightPath(viewer: Viewer, flight: Flight): Entity | null {
  const detail = flight.detail;
  if (!detail) {
    return null;
  }

  const points =
    detail.routeCoordinates.length > 0
      ? detail.routeCoordinates
      : detail.originCoordinates && detail.destinationCoordinates
        ? greatCirclePoints(detail.originCoordinates, detail.destinationCoordinates, 64)
        : [];

  if (points.length < 2) {
    return null;
  }

  clearFlightPaths(viewer);

  return viewer.entities.add({
    id: `${PATH_ID_PREFIX}${flight.icao24}`,
    polyline: {
      positions: Cartesian3.fromDegreesArray(toDegreesArray(points)),
      width: 3,
      material: new PolylineGlowMaterialProperty({
        glowPower: 0.2,
        color: Color.CYAN.withAlpha(0.75),
      }),
    },
  });
}
