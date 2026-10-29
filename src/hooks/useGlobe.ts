import { ClockRange, JulianDate, defined, ScreenSpaceEventType, type Cartesian2, type Viewer } from 'cesium';
import { useEffect, useMemo, useRef } from 'react';
import { getFlightIdFromEntity, syncAircraftEntities } from '../globe/entities';
import { applyDarkSkin, applyLightSkin } from '../globe/layers';
import { clearFlightPaths, drawFlightPath } from '../globe/paths';
import { flyToFlight } from '../globe/camera';
import { clearFlightTrails, syncFlightTrails } from '../globe/trails';
import { useUiStore, useFlightStore } from '../store';
import { useVisibleFlights } from './useVisibleFlights';
import { playbackBounds } from '../utils/playback';

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
  const followFlight = useUiStore((state) => state.followFlight);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const playbackPlaying = useUiStore((state) => state.playbackPlaying);
  const playbackSpeed = useUiStore((state) => state.playbackSpeed);
  const clockPublishedTime = useRef(false);
  const appliedPlaybackMs = useRef<number | null>(null);

  const selectedFlight = useMemo(() => {
    return visibleFlights.find((flight) => flight.icao24 === selectedFlightId) ?? null;
  }, [selectedFlightId, visibleFlights]);

  const selectedFlightRef = useRef(selectedFlight);
  selectedFlightRef.current = selectedFlight;
  // The store keeps the same detail reference across polls, so this changes only when replaced.
  const selectedDetail = selectedFlight?.detail;
  const selectedTrack = selectedFlight?.track;
  const selectedVisible = Boolean(selectedFlight);
  const bounds = useMemo(() => playbackBounds(
    selectedFlight?.track && selectedFlight.track.length > 1 ? [selectedFlight] : visibleFlights,
  ), [selectedFlight, visibleFlights]);

  useEffect(() => {
    if (!viewer) return;
    if (!bounds) {
      viewer.clock.shouldAnimate = false;
      return;
    }
    viewer.clock.startTime = JulianDate.fromDate(new Date(bounds[0]));
    viewer.clock.stopTime = JulianDate.fromDate(new Date(bounds[1]));
    viewer.clock.clockRange = ClockRange.CLAMPED;
    viewer.clock.multiplier = playbackSpeed;
    viewer.clock.shouldAnimate = playbackPlaying;
  }, [bounds, playbackPlaying, playbackSpeed, viewer]);

  useEffect(() => {
    const skipSync = clockPublishedTime.current;
    clockPublishedTime.current = false;
    if (!viewer || !bounds) return;
    const targetMs = playbackTime?.getTime() ?? bounds[1];
    const userMovedTime = appliedPlaybackMs.current !== targetMs;
    appliedPlaybackMs.current = targetMs;
    if (skipSync) return;
    if (!userMovedTime && viewer.clock.currentTime) {
      const currentMs = JulianDate.toDate(viewer.clock.currentTime).getTime();
      if (currentMs >= bounds[0] && currentMs <= bounds[1]) return;
    }
    viewer.clock.currentTime = JulianDate.fromDate(new Date(targetMs));
  }, [bounds, playbackTime, viewer]);

  useEffect(() => {
    if (!viewer) return;
    let lastPublished = 0;
    return viewer.clock.onTick.addEventListener(() => {
      if (!viewer.clock.shouldAnimate || !useUiStore.getState().playbackPlaying) return;
      const complete = JulianDate.greaterThanOrEquals(viewer.clock.currentTime, viewer.clock.stopTime);
      if (Date.now() - lastPublished >= 1000 || complete) {
        lastPublished = Date.now();
        clockPublishedTime.current = true;
        useUiStore.getState().setPlaybackTime(JulianDate.toDate(viewer.clock.currentTime));
      }
      if (complete) useUiStore.getState().setPlaybackPlaying(false);
    });
  }, [viewer]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    syncAircraftEntities(viewer, visibleFlights, selectedFlightId);
    syncFlightTrails(viewer, visibleFlights, selectedFlightId);
  }, [selectedFlightId, viewer, visibleFlights]);

  useEffect(() => {
    if (!viewer) return;
    const refreshTrails = () => syncFlightTrails(viewer, visibleFlights, selectedFlightId);
    const removeListener = viewer.camera.moveEnd.addEventListener(refreshTrails);
    return () => removeListener();
  }, [selectedFlightId, viewer, visibleFlights]);

  useEffect(() => {
    if (!viewer) return;
    return () => clearFlightTrails(viewer);
  }, [viewer]);

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

  useEffect(() => {
    if (!viewer) return;
    viewer.trackedEntity = followFlight && selectedFlightId
      ? viewer.entities.getById(`flight-${selectedFlightId}`)
      : undefined;
  }, [followFlight, selectedFlightId, viewer, visibleFlights]);

  // Effect B: draw or clear the flight path.
  useEffect(() => {
    if (!viewer) {
      return;
    }

    const flight = selectedFlightRef.current;
    if (flight?.detail || flight?.track) {
      drawFlightPath(viewer, flight);
    } else {
      clearFlightPaths(viewer);
    }
  }, [selectedFlightId, selectedDetail, selectedTrack, viewer]);

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
