import { act, cleanup, renderHook } from '@testing-library/react';
import { ClockRange, JulianDate, type Viewer } from 'cesium';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGlobe } from '../../src/hooks/useGlobe';
import { useFlightStore, useUiStore } from '../../src/store';
import type { AircraftState, FlightDetail } from '../../src/types/flight';
import { clearFlightPaths, drawFlightPath } from '../../src/globe/paths';
import { flyToFlight } from '../../src/globe/camera';

vi.mock('../../src/globe/entities', () => ({
  syncAircraftEntities: vi.fn(),
  getFlightIdFromEntity: vi.fn(),
}));
vi.mock('../../src/globe/layers', () => ({
  applyDarkSkin: vi.fn(),
  applyLightSkin: vi.fn(),
}));
vi.mock('../../src/globe/paths', () => ({
  drawFlightPath: vi.fn(),
  clearFlightPaths: vi.fn(),
}));
vi.mock('../../src/globe/camera', () => ({
  flyToFlight: vi.fn(),
}));
vi.mock('../../src/globe/trails', () => ({ syncFlightTrails: vi.fn(), clearFlightTrails: vi.fn() }));

const baseState: AircraftState = {
  icao24: 'a',
  callsign: 'AAA1',
  originCountry: 'US',
  longitude: 10,
  latitude: 20,
  baroAltitude: 10000,
  velocity: 200,
  trueTrack: 90,
  onGround: false,
  lastContact: 0,
};
const A = baseState;
const B: AircraftState = { ...baseState, icao24: 'b', callsign: 'BBB2', longitude: 30 };

const detail: FlightDetail = {
  flightNumber: 'AA1',
  airline: 'Test Air',
  airlineIata: 'TA',
  originIata: 'AAA',
  originCity: 'Alpha',
  destinationIata: 'BBB',
  destinationCity: 'Beta',
  departureTime: '2026-01-01T00:00:00Z',
  arrivalTime: '2026-01-01T02:00:00Z',
  status: 'active',
  aircraftType: 'A320',
  registration: 'N1',
  routeCoordinates: [],
};

const viewer = {
  screenSpaceEventHandler: { setInputAction: vi.fn(), removeInputAction: vi.fn() },
  camera: { moveEnd: { addEventListener: vi.fn(() => vi.fn()) } },
  clock: { onTick: { addEventListener: vi.fn(() => vi.fn()) } },
  entities: { getById: vi.fn() },
} as unknown as Viewer;

afterEach(() => {
  cleanup();
  act(() => {
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
    useUiStore.setState(useUiStore.getInitialState(), true);
  });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('useGlobe camera', () => {
  it('draws detail arriving after selection without flying again or redrawing on polls', () => {
    useFlightStore.getState().setFlights([A]);
    useFlightStore.getState().selectFlight('a');
    renderHook(() => useGlobe(viewer));
    expect(drawFlightPath).not.toHaveBeenCalled();

    act(() => useFlightStore.getState().setFlightDetail('a', detail));
    expect(drawFlightPath).toHaveBeenCalledExactlyOnceWith(viewer, expect.objectContaining({ detail }));
    act(() => useFlightStore.getState().setFlights([{ ...A, latitude: 21 }]));
    expect(drawFlightPath).toHaveBeenCalledTimes(1);
    expect(flyToFlight).toHaveBeenCalledTimes(1);
  });

  it('flies to the latest polled coordinates when the viewer becomes available', () => {
    useFlightStore.getState().setFlights([A]);
    useFlightStore.getState().selectFlight('a');
    const { rerender } = renderHook(({ v }: { v: Viewer | null }) => useGlobe(v), {
      initialProps: { v: null as Viewer | null },
    });
    act(() => useFlightStore.getState().setFlights([{ ...A, latitude: 25 }]));
    expect(flyToFlight).not.toHaveBeenCalled();
    rerender({ v: viewer });
    expect(flyToFlight).toHaveBeenCalledExactlyOnceWith(viewer, expect.objectContaining({ latitude: 25 }));
  });

  it('clears the path on deselection without moving the camera', () => {
    useFlightStore.getState().setFlights([A]);
    useFlightStore.getState().selectFlight('a');
    useFlightStore.getState().setFlightDetail('a', detail);
    renderHook(() => useGlobe(viewer));
    vi.mocked(clearFlightPaths).mockClear();
    act(() => useFlightStore.getState().selectFlight(null));
    expect(clearFlightPaths).toHaveBeenCalledExactlyOnceWith(viewer);
    expect(flyToFlight).toHaveBeenCalledTimes(1);
  });

  it('flies once per selection, not per poll', () => {
    act(() => {
      useFlightStore.getState().setFlights([A]);
      useFlightStore.getState().selectFlight('a');
    });
    renderHook(() => useGlobe(viewer));

    act(() => {
      useFlightStore.getState().setFlights([{ ...A, latitude: A.latitude + 0.1 }]);
    });
    act(() => {
      useFlightStore.getState().setFlights([{ ...A, latitude: A.latitude + 0.2 }]);
    });
    expect(flyToFlight).toHaveBeenCalledTimes(1);

    act(() => {
      useFlightStore.getState().setFlights([A, B]);
      useFlightStore.getState().selectFlight('b');
    });
    expect(flyToFlight).toHaveBeenCalledTimes(2);
  });

  it('redraws the path when the detail object is replaced while still present', () => {
    act(() => {
      useFlightStore.getState().setFlights([A]);
      useFlightStore.getState().selectFlight('a');
      useFlightStore.getState().setFlightDetail('a', detail);
    });
    renderHook(() => useGlobe(viewer));
    expect(drawFlightPath).toHaveBeenCalledTimes(1);
    act(() => useFlightStore.getState().setFlights([{ ...A, latitude: 22 }]));
    expect(drawFlightPath).toHaveBeenCalledTimes(1);
    const next = { ...detail, routeCoordinates: [[1, 2]] } as unknown as FlightDetail;
    act(() => useFlightStore.getState().setFlightDetail('a', next));
    expect(drawFlightPath).toHaveBeenCalledTimes(2);
    expect(flyToFlight).toHaveBeenCalledTimes(1);
  });

  it('flies again when the selected flight is removed and then restored', () => {
    act(() => {
      useFlightStore.getState().setFlights([A]);
      useFlightStore.getState().selectFlight('a');
    });
    renderHook(() => useGlobe(viewer));
    expect(flyToFlight).toHaveBeenCalledTimes(1);
    act(() => useFlightStore.getState().setFlights([B]));
    expect(flyToFlight).toHaveBeenCalledTimes(1);
    act(() => useFlightStore.getState().setFlights([A, B]));
    expect(flyToFlight).toHaveBeenCalledTimes(2);
    act(() => useFlightStore.getState().setFlights([{ ...A, latitude: 30 }, B]));
    expect(flyToFlight).toHaveBeenCalledTimes(2);
  });

  it('clears paths when the selected flight disappears', () => {
    act(() => {
      useFlightStore.getState().setFlights([A]);
      useFlightStore.getState().selectFlight('a');
      useFlightStore.getState().setFlightDetail('a', detail);
    });
    renderHook(() => useGlobe(viewer));
    expect(flyToFlight).toHaveBeenCalledTimes(1);
    vi.mocked(clearFlightPaths).mockClear();

    act(() => {
      useFlightStore.getState().setFlights([]);
    });
    expect(clearFlightPaths).toHaveBeenCalled();
    expect(flyToFlight).toHaveBeenCalledTimes(1);
  });
});

describe('useGlobe playback clock', () => {
  const startMs = 1_700_000_000_000;
  const endMs = startMs + 300_000;
  const track = [
    { longitude: 10, latitude: 20, altitude: 1000, timestamp: startMs / 1000 },
    { longitude: 11, latitude: 21, altitude: 1100, timestamp: endMs / 1000 },
  ];

  function makePlaybackViewer() {
    const seek = vi.fn();
    const removeTick = vi.fn();
    let tick = () => {};
    let current = JulianDate.fromDate(new Date(startMs));
    const clock = {
      multiplier: 1,
      shouldAnimate: false,
      startTime: new JulianDate(),
      stopTime: new JulianDate(),
      clockRange: ClockRange.UNBOUNDED,
      set currentTime(value: JulianDate) {
        seek(value);
        current = value;
      },
      get currentTime() {
        return current;
      },
      onTick: {
        addEventListener: vi.fn((fn: () => void) => {
          tick = fn;
          return removeTick;
        }),
      },
    };
    return {
      clock,
      localViewer: { ...viewer, clock } as unknown as Viewer,
      seek,
      removeTick,
      tick: () => tick(),
      // Cesium advances JulianDate in place; this must not count as an application seek.
      advanceTo: (milliseconds: number) => JulianDate.fromDate(new Date(milliseconds), current),
    };
  }

  beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState(), true);
    useFlightStore.setState(useFlightStore.getInitialState(), true);
    useFlightStore.getState().setFlights([{ ...A, track }]);
  });

  it.each([1, 10, 60, 300] as const)('uses %i× regardless of track duration', (speed) => {
    useUiStore.setState({ playbackSpeed: speed });
    const { clock, localViewer } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    expect(clock.multiplier).toBe(speed);
    expect(clock.clockRange).toBe(ClockRange.CLAMPED);
    expect(JulianDate.toDate(clock.startTime).getTime()).toBe(startMs);
    expect(JulianDate.toDate(clock.stopTime).getTime()).toBe(endMs);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(endMs);

    const longerTrack = [track[0], { ...track[1], timestamp: (startMs + 86_400_000) / 1000 }];
    act(() => useFlightStore.getState().setFlights([{ ...A, track: longerTrack }]));
    expect(clock.multiplier).toBe(speed);
    expect(JulianDate.toDate(clock.stopTime).getTime()).toBe(startMs + 86_400_000);
  });

  it.each([true, false])('changes speed without rewinding when playing is %s', (playing) => {
    useUiStore.setState({ playbackTime: new Date(startMs), playbackPlaying: playing });
    const { clock, localViewer, seek, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    advanceTo(startMs + 12_345);
    seek.mockClear();

    for (const speed of [1, 10, 300, 60] as const) {
      act(() => useUiStore.getState().setPlaybackSpeed(speed));
      expect(clock.multiplier).toBe(speed);
      expect(clock.shouldAnimate).toBe(playing);
      expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs + 12_345);
    }
    expect(seek).not.toHaveBeenCalled();
    expect(useUiStore.getState().playbackTime).toEqual(new Date(startMs));
  });

  it('publishes advancing ticks without rewinding and still applies a subsequent user seek', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(startMs);
    useUiStore.setState({ playbackTime: new Date(startMs), playbackPlaying: true });
    const { clock, localViewer, seek, tick, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    seek.mockClear();

    advanceTo(startMs + 60_000);
    act(() => tick());
    expect(useUiStore.getState().playbackTime).toEqual(new Date(startMs + 60_000));
    expect(clock.shouldAnimate).toBe(true);
    expect(seek).not.toHaveBeenCalled();

    now.mockReturnValue(startMs + 999);
    advanceTo(startMs + 120_000);
    act(() => tick());
    expect(useUiStore.getState().playbackTime).toEqual(new Date(startMs + 60_000));
    now.mockReturnValue(startMs + 1000);
    act(() => tick());
    expect(useUiStore.getState().playbackTime).toEqual(new Date(startMs + 120_000));
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs + 120_000);
    expect(seek).not.toHaveBeenCalled();

    act(() => useUiStore.getState().setPlaybackTime(new Date(startMs + 30_000)));
    expect(seek).toHaveBeenCalledTimes(1);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs + 30_000);
    act(() => useUiStore.getState().setPlaybackTime(null));
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(endMs);
  });

  it('pauses and resumes without resetting the clock to the last published time', () => {
    useUiStore.setState({ playbackTime: new Date(startMs), playbackPlaying: true });
    const { clock, localViewer, seek, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    advanceTo(startMs + 15_000);
    seek.mockClear();
    act(() => useUiStore.getState().setPlaybackPlaying(false));
    expect(clock.shouldAnimate).toBe(false);
    act(() => useUiStore.getState().setPlaybackPlaying(true));
    expect(clock.shouldAnimate).toBe(true);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs + 15_000);
    expect(seek).not.toHaveBeenCalled();
  });

  it.each([startMs, startMs + 150_000, endMs])('applies an initial explicit seek to %i', (time) => {
    useUiStore.setState({ playbackTime: new Date(time) });
    const { clock, localViewer, seek } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    expect(seek).toHaveBeenCalledTimes(1);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(time);
  });

  it('keeps the running clock when only the visible tracks are replaced', () => {
    useUiStore.setState({ playbackTime: new Date(startMs + 100_000), playbackPlaying: true });
    const { clock, localViewer, seek, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    advanceTo(startMs + 160_000);
    seek.mockClear();
    act(() => useFlightStore.getState().setFlights([{ ...A, latitude: 22, track }]));
    expect(seek).not.toHaveBeenCalled();
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs + 160_000);
    expect(clock.shouldAnimate).toBe(true);
  });

  it.each([startMs - 1000, endMs + 1000])('resynchronizes a clock outside the bounds at %i', (time) => {
    useUiStore.setState({ playbackTime: new Date(startMs + 100_000) });
    const { clock, localViewer, seek, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    advanceTo(time);
    seek.mockClear();
    act(() => useFlightStore.getState().setFlights([{ ...A, track }]));
    expect(seek).toHaveBeenCalledTimes(1);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs + 100_000);
  });

  it.each([
    { label: 'empty track', points: [] },
    { label: 'one sample', points: [track[0]] },
    { label: 'zero duration', points: [track[0], track[0]] },
  ])('stops animating without usable bounds: $label', ({ points }) => {
    useUiStore.setState({ playbackPlaying: true });
    const { clock, localViewer, seek } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    expect(clock.shouldAnimate).toBe(true);
    seek.mockClear();
    act(() => useFlightStore.getState().setFlights([{ ...A, track: points }]));
    expect(clock.shouldAnimate).toBe(false);
    expect(seek).not.toHaveBeenCalled();
    act(() => useFlightStore.getState().setFlights([{ ...A, track }]));
    expect(clock.shouldAnimate).toBe(true);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(endMs);
  });

  it('publishes the final tick inside the throttle window and stops without seeking', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(startMs);
    useUiStore.setState({ playbackTime: new Date(startMs), playbackPlaying: true });
    const { clock, localViewer, seek, tick, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    advanceTo(endMs - 1000);
    act(() => tick());
    seek.mockClear();
    now.mockReturnValue(startMs + 1);
    advanceTo(endMs);
    act(() => tick());
    expect(useUiStore.getState()).toMatchObject({ playbackTime: new Date(endMs), playbackPlaying: false });
    expect(clock.shouldAnimate).toBe(false);
    expect(seek).not.toHaveBeenCalled();
  });

  it.each([
    { storePlaying: false, clockAnimating: true },
    { storePlaying: true, clockAnimating: false },
  ])('ignores ticks when playback is inactive: %j', ({ storePlaying, clockAnimating }) => {
    useUiStore.setState({ playbackTime: new Date(startMs), playbackPlaying: storePlaying });
    const { clock, localViewer, seek, tick, advanceTo } = makePlaybackViewer();
    renderHook(() => useGlobe(localViewer));
    clock.shouldAnimate = clockAnimating;
    advanceTo(startMs + 60_000);
    seek.mockClear();
    act(() => tick());
    expect(useUiStore.getState().playbackTime).toEqual(new Date(startMs));
    expect(seek).not.toHaveBeenCalled();
  });

  it('initializes when a viewer becomes available and removes its tick listener on unmount', () => {
    useUiStore.setState({ playbackTime: new Date(startMs), playbackPlaying: true });
    const { clock, localViewer, removeTick } = makePlaybackViewer();
    const { rerender, unmount } = renderHook(({ v }: { v: Viewer | null }) => useGlobe(v), {
      initialProps: { v: null as Viewer | null },
    });
    expect(clock.onTick.addEventListener).not.toHaveBeenCalled();
    rerender({ v: localViewer });
    expect(clock.shouldAnimate).toBe(true);
    expect(clock.multiplier).toBe(60);
    expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(startMs);
    expect(clock.onTick.addEventListener).toHaveBeenCalledTimes(1);
    act(() => useUiStore.getState().setPlaybackSpeed(10));
    expect(clock.onTick.addEventListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(removeTick).toHaveBeenCalledTimes(1);
  });
});
