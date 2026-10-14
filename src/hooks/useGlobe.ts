import { defined, ScreenSpaceEventType, type Cartesian2, type Viewer } from 'cesium';
import { useEffect, useMemo, useRef } from 'react';
import { getFlightIdFromEntity, syncAircraftEntities } from '../globe/entities';
import { applyDarkSkin, applyLightSkin } from '../globe/layers';
import { clearFlightPaths, drawFlightPath } from '../globe/paths';
import { flyToFlight } from '../globe/camera';
import { useUiStore, useFlightStore } from '../store';
import { useVisibleFlights } from './useVisibleFlights';

/**
 * Synchronizes visible aircraft, skin, and selected flight paths with a Cesium viewer.
 * Flies to a visible selected flight when its ID, its visibility, or the viewer changes;
 * redraws its path when the detail object is replaced. Aircraft clicks
 * update the selection; cleanup removes the click action. A null viewer has no effects.
 */
export function useGlobe(viewer: Viewer | null) {
  const visibleFlights = useVisibleFlights();
  const selectedFlightId = useFlightStore((state) => state.selectedFlightId);
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const globeSkin = useUiStore((state) => state.globeSkin);

  const selectedFlight = useMemo(() => {
    return visibleFlights.find((flight) => flight.icao24 === selectedFlightId) ?? null;
  }, [selectedFlightId, visibleFlights]);

  const selectedFlightRef = useRef(selectedFlight);
  selectedFlightRef.current = selectedFlight;
  // The store keeps the same detail reference across polls, so this changes only when replaced.
  const selectedDetail = selectedFlight?.detail;
  const selectedVisible = Boolean(selectedFlight);

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

  // Effect A: fly only when the selection (or viewer) changes, not on every poll.
  useEffect(() => {
    const flight = selectedFlightRef.current;
    if (!viewer || !flight) {
      return;
    }

    flyToFlight(viewer, flight);
  }, [selectedFlightId, selectedVisible, viewer]);

  // Effect B: draw or clear the flight path.
  useEffect(() => {
    if (!viewer) {
      return;
    }

    const flight = selectedFlightRef.current;
    if (flight?.detail) {
      drawFlightPath(viewer, flight);
    } else {
      clearFlightPaths(viewer);
    }
  }, [selectedFlightId, selectedDetail, viewer]);

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
