import { defined, ScreenSpaceEventType, type Cartesian2, type Viewer } from 'cesium';
import { useEffect, useMemo } from 'react';
import { getFlightIdFromEntity, syncAircraftEntities } from '../globe/entities';
import { applyDarkSkin, applyLightSkin } from '../globe/layers';
import { clearFlightPaths, drawFlightPath } from '../globe/paths';
import { flyToFlight } from '../globe/camera';
import { useUiStore, useFlightStore } from '../store';
import { useVisibleFlights } from './useVisibleFlights';

export function useGlobe(viewer: Viewer | null) {
  const visibleFlights = useVisibleFlights();
  const selectedFlightId = useFlightStore((state) => state.selectedFlightId);
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const globeSkin = useUiStore((state) => state.globeSkin);

  const selectedFlight = useMemo(() => {
    return visibleFlights.find((flight) => flight.icao24 === selectedFlightId) ?? null;
  }, [selectedFlightId, visibleFlights]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    syncAircraftEntities(viewer, visibleFlights, selectedFlightId);
  }, [selectedFlightId, viewer, visibleFlights]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    if (globeSkin === 'dark') {
      applyDarkSkin(viewer);
    } else {
      applyLightSkin(viewer);
    }
  }, [globeSkin, viewer]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    if (!selectedFlight) {
      clearFlightPaths(viewer);
      return;
    }

    flyToFlight(viewer, selectedFlight);
    if (selectedFlight.detail) {
      drawFlightPath(viewer, selectedFlight);
    } else {
      clearFlightPaths(viewer);
    }
  }, [selectedFlight, viewer]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const handler = viewer.screenSpaceEventHandler;
    handler.setInputAction((movement: { position?: Cartesian2 }) => {
      if (!movement.position) {
        return;
      }

      const picked = viewer.scene.pick(movement.position);
      if (!defined(picked) || !('id' in picked)) {
        return;
      }

      const flightId = getFlightIdFromEntity(picked.id);
      if (flightId) {
        selectFlight(flightId);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      handler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
    };
  }, [selectFlight, viewer]);
}
