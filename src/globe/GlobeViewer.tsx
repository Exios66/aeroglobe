import { createWorldTerrainAsync, Ion, Viewer } from 'cesium';
import { useEffect, useRef, useState } from 'react';
import { applyDarkSkin } from './layers';

type GlobeViewerProps = {
  onReady?: (viewer: Viewer | null) => void;
};

export function GlobeViewer({ onReady }: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    let cancelled = false;
    let viewer: Viewer | null = null;

    void (async () => {
      try {
        Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN || '';

        viewer = new Viewer(containerRef.current!, {
          terrainProvider: await createWorldTerrainAsync(),
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

        onReady?.(viewer);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Globe failed to initialize in this browser.';
        setLoadError(message);
        onReady?.(null);
      }
    })();

    return () => {
      cancelled = true;
      onReady?.(null);
      if (viewer && !viewer.isDestroyed()) {
        viewer.destroy();
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
