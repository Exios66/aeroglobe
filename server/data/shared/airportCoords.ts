/**
 * IATA code -> [longitude, latitude]. Shared across operators/airports.
 * Coordinates are approximate airport centers (WGS84).
 */
export const ORD_COORDS: [number, number] = [-87.9047, 41.9786];
export const LAS_COORDS: [number, number] = [-115.1522, 36.084];
export const DEN_COORDS: [number, number] = [-104.6732, 39.8617];

export const AIRPORT_COORDS: Record<string, [number, number]> = {
  ORD: ORD_COORDS,
  LAS: LAS_COORDS,
  DEN: DEN_COORDS,
  RNO: [-119.7681, 39.4991],
  MAF: [-102.2019, 31.9425],
  TUS: [-110.9410, 32.1161],
  BUR: [-118.3597, 34.2006],
  BNA: [-86.6782, 36.1245],
  BWI: [-76.6683, 39.1754],
  DAL: [-96.8517, 32.8968],
  PHX: [-112.0116, 33.4345],
  AUS: [-97.6699, 30.1944],
  MCO: [-81.3081, 28.4312],
  MDW: [-87.7524, 41.786],
  HOU: [-95.2789, 29.6454],
  SAT: [-98.4698, 29.5337],
  STL: [-90.3700, 38.7487],
  MCI: [-94.7139, 39.2976],
  TPA: [-82.5332, 27.9755],
  FLL: [-80.1528, 26.0742],
  RDU: [-78.7875, 35.8776],
  SNA: [-117.8678, 33.6757],
  SAN: [-117.1896, 32.7336],
  SJC: [-121.9292, 37.3626],
  OAK: [-122.2211, 37.7213],
  SMF: [-121.5906, 38.6954],
  PDX: [-122.5975, 45.5887],
  PHL: [-75.2402, 39.8729],
  SEA: [-122.3088, 47.4502],
  SRQ: [-82.5540, 27.3954],
  SLC: [-111.9780, 40.7899],
  ABQ: [-106.6092, 35.0402],
  ELP: [-106.3786, 31.8073],
  MSY: [-90.2580, 29.9934],
  ATL: [-84.4281, 33.6367],
  MIA: [-80.2906, 25.7959],
  DCA: [-77.0377, 38.8521],
  IAD: [-77.4558, 38.9445],
  EWR: [-74.1687, 40.6895],
  LGA: [-73.8726, 40.7769],
  JFK: [-73.7781, 40.6413],
  BOS: [-71.0052, 42.3643],
  CLE: [-81.8498, 41.4117],
  DTW: [-83.3534, 42.2124],
  IND: [-86.2944, 39.7173],
  CMH: [-82.8919, 39.998],
  CVG: [-84.6678, 39.0488],
  MSP: [-93.2218, 44.8820],
  DFW: [-97.0380, 32.8968],
  OKC: [-97.6007, 35.3931],
  TUL: [-95.8881, 36.1984],
};

export function getDestinationCoords(iata: string): [number, number] | null {
  const coords = AIRPORT_COORDS[iata?.toUpperCase()];
  return coords ?? null;
}
