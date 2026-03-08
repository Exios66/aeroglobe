import { BoundingSphere, Cartesian3, Math as CesiumMath, type Viewer } from 'cesium';
import type { Flight } from '../types/flight';

export function flyToFlight(viewer: Viewer, flight: Flight): void {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(flight.longitude, flight.latitude, 800_000),
    orientation: {
      heading: CesiumMath.toRadians(flight.trueTrack ?? 0),
      pitch: CesiumMath.toRadians(-55),
      roll: 0,
    },
    duration: 1.8,
  });
}

export function flyToRoute(
  viewer: Viewer,
  origin: [number, number],
  destination: [number, number],
): void {
  const points = [
    Cartesian3.fromDegrees(origin[0], origin[1], 50_000),
    Cartesian3.fromDegrees(destination[0], destination[1], 50_000),
  ];

  viewer.camera.flyToBoundingSphere(BoundingSphere.fromPoints(points), {
    duration: 2.2,
  });
}
