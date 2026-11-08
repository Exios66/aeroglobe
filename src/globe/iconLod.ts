/**
 * Density-aware aircraft icon level-of-detail. The globe can carry ~7,000 visible aircraft;
 * at that density the full plane silhouette turns into unreadable confetti, so the icon set
 * degrades with camera altitude and visible count:
 *   dot  — 8 px altitude-tier signal dot (global perspective, hundreds of thousands of acres per pixel)
 *   dart — bold simplified silhouette that still reads when crowded (regional perspective)
 *   plane— the full marker (national scale or closer)
 * The selected aircraft always keeps its full plane shape, whatever the LOD.
 */
export type IconLod = 'dot' | 'dart' | 'plane';

/** Camera altitudes are meters above the ellipsoid (Cesium camera.positionCartographic.height). */
export function resolveIconLod(cameraHeightMeters: number, visibleCount: number): IconLod {
  if (visibleCount > 1500) {
    // Over-crowded no matter the zoom: dots until the user filters or zooms harder.
    return cameraHeightMeters < 600_000 ? 'plane' : 'dot';
  }
  if (cameraHeightMeters < 1_200_000) return 'plane';
  if (cameraHeightMeters < 4_000_000 && visibleCount <= 1200) return 'dart';
  return 'dot';
}

/** The LOD a given aircraft renders at: selection always upgrades to the full plane. */
export function lodForAircraft(lod: IconLod, selected: boolean): IconLod {
  return selected ? 'plane' : lod;
}

/** Billboard scale plus distance attenuation per LOD — dots stay tappable, planes stay legible. */
export function lodScale(lod: IconLod): number {
  switch (lod) {
    case 'dot':
      return 0.34;
    case 'dart':
      return 0.55;
    case 'plane':
      return 0.6;
  }
}
