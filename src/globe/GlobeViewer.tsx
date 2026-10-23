import {
  createWorldTerrainAsync,
  Ion,
  ImageryLayer,
  OpenStreetMapImageryProvider,
  Viewer,
} from 'cesium';
import { useEffect, useRef, useState } from 'react';
import { applyDarkSkin } from './layers';
import { resolveIonToken } from './ionToken';

type GlobeViewerProps = {
  onReady?: (viewer: Viewer | null) => void;
};

/**
 * Creates a Cesium globe with OpenStreetMap imagery and optionally loads Ion terrain
 * and imagery (layered over OSM, removed again on Ion errors) when a token is configured. Viewer-construction failures show an error;
 * failed Ion requests keep the available fallback assets.
 * onReady receives the viewer after setup and null on construction failure or cleanup.
 * Cleanup destroys the viewer; changing onReady recreates it.
 */
export function GlobeViewer({ onReady }: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let viewer: Viewer | null = null;

    try {
      viewer = new Viewer(containerRef.current, {
        baseLayer: new ImageryLayer(
          new OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }),
        ),
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        shouldAnimate: true,
        msaaSamples: 4,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Globe failed to initialize in this browser.';
      setLoadError(message);
      onReady?.(null);
      return undefined;
    }

    const created = viewer;
    // Respect retina screens while bounding fill rate on very dense displays.
    created.useBrowserRecommendedResolution = false;
    created.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1));
    created.scene.postProcessStages.fxaa.enabled = true;
    created.scene.globe.maximumScreenSpaceError = 1.5;
    created.scene.globe.tileCacheSize = 200;
    created.scene.globe.enableLighting = true;
    created.scene.globe.depthTestAgainstTerrain = false;
    if (created.scene.skyAtmosphere) {
      created.scene.skyAtmosphere.show = true;
    }
    created.scene.globe.showGroundAtmosphere = true;
    created.scene.fog.enabled = true;
    created.scene.fog.density = 0.0001;
    applyDarkSkin(created);

    const token = resolveIonToken(import.meta.env.VITE_CESIUM_ION_TOKEN);
    if (token) {
      Ion.defaultAccessToken = token;
      let warned = false;
      const warnOnce = () => {
        if (!warned) {
          warned = true;
          console.warn('Cesium Ion assets unavailable; keeping OpenStreetMap imagery.');
        }
      };

      createWorldTerrainAsync()
        .then((terrain) => {
          if (!created.isDestroyed()) {
            created.terrainProvider = terrain;
          }
        })
        .catch(warnOnce);

      // OSM stays underneath; Ion covers it fully and is dropped if its tiles fail.
      const ionLayer = ImageryLayer.fromWorldImagery({});
      created.imageryLayers.add(ionLayer);
      const dropIon = () => {
        warnOnce();
        if (!created.isDestroyed() && created.imageryLayers.contains(ionLayer)) {
          created.imageryLayers.remove(ionLayer);
        }
      };
      ionLayer.readyEvent.addEventListener(() => {
        if (!created.isDestroyed()) {
          ionLayer.imageryProvider.errorEvent.addEventListener(dropIon);
        }
      });
      ionLayer.errorEvent.addEventListener(dropIon);
    }

    onReady?.(created);

    return () => {
      onReady?.(null);
      if (!created.isDestroyed()) {
        created.destroy();
      }
    };
  }, [onReady]);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-200">
        Globe failed to load. {loadError}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
