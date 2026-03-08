/**
 * Airport coordinates (longitude, latitude) for mapping and route display.
 * IATA code → [lon, lat]. Shared across operator parsers.
 */

/** Chicago O'Hare (ORD) [longitude, latitude] */
export const ORD_COORDS: [number, number] = [-87.9047, 41.9786];

/** Las Vegas Harry Reid (LAS) [longitude, latitude] */
export const LAS_COORDS: [number, number] = [-115.1522, 36.084];

/** IATA → [longitude, latitude]. Add airports as needed for fallback/detail. */
export const AIRPORT_COORDS: Record<string, [number, number]> = {
  ORD: ORD_COORDS,
  LAS: LAS_COORDS,
  DEN: [-104.6732, 39.8617],
  ATL: [-84.4281, 33.6367],
  LAX: [-118.4085, 33.9425],
  DFW: [-97.038, 32.8968],
  PHX: [-112.0116, 33.4345],
  MCO: [-81.3089, 28.4294],
  SFO: [-122.375, 37.619],
  SEA: [-122.3088, 47.4502],
};

/**
 * Returns [longitude, latitude] for an IATA code, or null if unknown.
 */
export function getDestinationCoords(iata: string): [number, number] | null {
  if (!iata || typeof iata !== 'string') return null;
  const key = iata.trim().toUpperCase();
  return AIRPORT_COORDS[key] ?? null;
}
