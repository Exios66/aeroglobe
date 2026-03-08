import { Color, type Viewer } from 'cesium';

export function applyDarkSkin(viewer: Viewer): void {
  viewer.scene.backgroundColor = Color.fromCssColorString('#020617');
  viewer.scene.globe.baseColor = Color.fromCssColorString('#020617');
  viewer.scene.globe.enableLighting = true;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.brightnessShift = -0.25;
    viewer.scene.skyAtmosphere.hueShift = -0.02;
  }
}

export function applyLightSkin(viewer: Viewer): void {
  viewer.scene.backgroundColor = Color.fromCssColorString('#dbeafe');
  viewer.scene.globe.baseColor = Color.fromCssColorString('#bfdbfe');
  viewer.scene.globe.enableLighting = true;
  if (viewer.scene.skyAtmosphere) {
    viewer.scene.skyAtmosphere.brightnessShift = 0.08;
    viewer.scene.skyAtmosphere.hueShift = 0;
  }
}
