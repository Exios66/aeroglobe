import type { RegionCode } from '../types/filters';
import { REGION_BOUNDS } from './constants';

const EARTH_RADIUS_KM = 6371;

export function haversineDistance(
  [lon1, lat1]: [number, number],
  [lon2, lat2]: [number, number],
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function greatCirclePoints(
  origin: [number, number],
  destination: [number, number],
  count = 64,
): [number, number][] {
  if (count <= 2) {
    return [origin, destination];
  }

  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;

  const [lon1, lat1] = origin.map(toRad) as [number, number];
  const [lon2, lat2] = destination.map(toRad) as [number, number];

  const delta = 2 * Math.asin(
    Math.sqrt(
      Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
    ),
  );

  if (delta === 0) {
    return Array.from({ length: count }, () => origin);
  }

  return Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);

    return [toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))] as [
      number,
      number,
    ];
  });
}

export function metersToFeet(value: number | null | undefined): number {
  return value ? value * 3.28084 : 0;
}

export function msToKnots(value: number | null | undefined): number {
  return value ? value * 1.94384 : 0;
}

export function getRegionForCoordinates(longitude: number, latitude: number): RegionCode | null {
  return (
    (Object.entries(REGION_BOUNDS).find(([, bounds]) => {
      return (
        longitude >= bounds.lon[0] &&
        longitude <= bounds.lon[1] &&
        latitude >= bounds.lat[0] &&
        latitude <= bounds.lat[1]
      );
    })?.[0] as RegionCode | undefined) ?? null
  );
}

export function isWithinAltitudeRange(
  altitudeFeet: number,
  range: [number, number],
): boolean {
  return altitudeFeet >= range[0] && altitudeFeet <= range[1];
}
