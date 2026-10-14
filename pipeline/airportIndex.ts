import type { AirportRow } from './ref';

const R_KM = 6371.0088;

/** Great-circle distance in kilometers between coordinates in degrees. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const latCell = (lat: number) => Math.floor(lat);
const lonCell = (lon: number) => ((Math.floor(lon) % 360) + 540) % 360; // 0..359, wraps

/** 1-degree grid index; searches the 3x3 cell neighbourhood, so maxKm should be <= ~100 km. */
export class AirportIndex {
  private readonly cells = new Map<number, AirportRow[]>();

  /** Indexes the supplied airport rows by their coordinates in degrees. */
  constructor(rows: AirportRow[]) {
    for (const row of rows) {
      const key = latCell(row[5]) * 360 + lonCell(row[6]);
      const cell = this.cells.get(key);
      if (cell) cell.push(row);
      else this.cells.set(key, [row]);
    }
  }

  /**
   * Returns the nearest indexed airport within maxKm kilometers, including the boundary,
   * or null if none is found. Coordinates are in degrees. Only the query cell and its
   * eight neighbors are searched, wrapping longitude; airports outside them may be missed.
   */
  nearest(lat: number, lon: number, maxKm: number): AirportRow | null {
    const la = latCell(lat);
    const lo = lonCell(lon);
    let best: AirportRow | null = null;
    let bestKm = maxKm;
    for (let dLa = -1; dLa <= 1; dLa++) {
      for (let dLo = -1; dLo <= 1; dLo++) {
        const cell = this.cells.get((la + dLa) * 360 + ((lo + dLo + 360) % 360));
        if (!cell) continue;
        for (const row of cell) {
          const km = haversineKm(lat, lon, row[5], row[6]);
          if (km <= bestKm) {
            best = row;
            bestKm = km;
          }
        }
      }
    }
    return best;
  }
}
