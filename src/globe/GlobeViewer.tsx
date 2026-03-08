import {
  createWorldTerrainAsync,
  EllipsoidTerrainProvider,
  Ion,
  Viewer,
  type TerrainProvider,
} from 'cesium';
import { useEffect, useRef, useState } from 'react';
import { applyDarkSkin } from './layers';

type GlobeViewerProps = {
  onReady?: (viewer: Viewer | null) => void;
};

export function GlobeViewer({ onReady }: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  const [loadError, setLoadError] = useState<string | null>(null);

  onReadyRef.current = onReady;

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let cancelled = false;
    let viewer: Viewer | null = null;

    void (async () => {
      try {
        Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

        let terrainProvider: TerrainProvider;
        try {
          terrainProvider = await createWorldTerrainAsync();
        } catch {
          terrainProvider = new EllipsoidTerrainProvider();
        }

        if (cancelled) {
          return;
        }

        viewer = new Viewer(containerRef.current!, {
          terrainProvider,
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
        });

        if (cancelled) {
          viewer.destroy();
          return;
        }

        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        if (viewer.scene.skyAtmosphere) {
          viewer.scene.skyAtmosphere.show = true;
        }
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.0001;
        applyDarkSkin(viewer);

        onReadyRef.current?.(viewer);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Globe failed to initialize in this browser.';
        setLoadError(message);
        onReadyRef.current?.(null);
      }
    })();

    return () => {
      cancelled = true;
      onReadyRef.current?.(null);
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, []);

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-slate-200">
        Globe failed to load. {loadError}
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
