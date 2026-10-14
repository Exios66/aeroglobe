const R_KM = 6371.0088;

/** Wraps a longitude difference into [-180, 180]. */
export function wrapLonDelta(dLon: number): number {
  return dLon - 360 * Math.round(dLon / 360);
}

/** Great-circle distance in kilometers between coordinates in degrees. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = wrapLonDelta(lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Great-circle distance in meters between coordinates in degrees. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}
