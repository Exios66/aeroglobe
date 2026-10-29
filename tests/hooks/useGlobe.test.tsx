import { act, renderHook } from '@testing-library/react';
import type { Viewer } from 'cesium';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  act(() => {
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
  });
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
  it('uses the selected speed and ignores clock-published time updates', () => {
    const writes: unknown[] = [];
    let tick = () => {};
    const clock = {
      multiplier: 0,
      shouldAnimate: false,
      startTime: undefined as unknown,
      stopTime: undefined as unknown,
      clockRange: undefined as unknown,
      current: undefined as unknown,
      set currentTime(value: unknown) {
        writes.push(value);
        this.current = value;
      },
      get currentTime() {
        return this.current;
      },
      onTick: {
        addEventListener: (fn: () => void) => {
          tick = fn;
          return () => {};
        },
      },
    };
    const localViewer = {
      ...viewer,
      clock,
      entities: { getById: vi.fn() },
    } as unknown as Viewer;
    act(() => {
      useUiStore.setState({ playbackSpeed: 60, playbackTime: null, playbackPlaying: false });
      useFlightStore.getState().setFlights([{
        ...A,
        track: [
          { longitude: 10, latitude: 20, altitude: 1000, timestamp: 1_700_000_000 },
          { longitude: 11, latitude: 21, altitude: 1100, timestamp: 1_700_000_300 },
        ],
      }]);
    });
    renderHook(() => useGlobe(localViewer));
    expect(clock.multiplier).toBe(60);
    const afterSeek = writes.length;
    expect(afterSeek).toBeGreaterThan(0);

    act(() => useUiStore.getState().setPlaybackSpeed(300));
    expect(clock.multiplier).toBe(300);
    expect(writes).toHaveLength(afterSeek);

    act(() => useUiStore.setState({ playbackPlaying: true }));
    const beforeTick = writes.length;
    act(() => tick());
    expect(writes).toHaveLength(beforeTick);
    act(() => useUiStore.setState({ playbackPlaying: false, playbackSpeed: 60, playbackTime: null }));
  });

  it('keeps the running clock when only the visible tracks are replaced', () => {
    const writes: unknown[] = [];
    const clock = {
      multiplier: 1,
      shouldAnimate: false,
      startTime: undefined as unknown,
      stopTime: undefined as unknown,
      clockRange: undefined as unknown,
      current: undefined as unknown,
      set currentTime(value: unknown) {
        writes.push(value);
        this.current = value;
      },
      get currentTime() {
        return this.current;
      },
      onTick: { addEventListener: () => () => {} },
    };
    const localViewer = { ...viewer, clock, entities: { getById: vi.fn() } } as unknown as Viewer;
    const track = [
      { longitude: 10, latitude: 20, altitude: 1000, timestamp: 1_700_000_000 },
      { longitude: 11, latitude: 21, altitude: 1100, timestamp: 1_700_000_300 },
    ];
    act(() => {
      useUiStore.setState({ playbackTime: new Date(1_700_000_100_000), playbackPlaying: true, playbackSpeed: 60 });
      useFlightStore.getState().setFlights([{ ...A, track }]);
    });
    renderHook(() => useGlobe(localViewer));
    const afterSeek = writes.length;
    act(() => useFlightStore.getState().setFlights([{ ...A, latitude: 22, track }]));
    expect(writes).toHaveLength(afterSeek);
    expect(clock.shouldAnimate).toBe(true);

    act(() => useFlightStore.getState().setFlights([{ ...A, track: [] }]));
    expect(clock.shouldAnimate).toBe(false);
    act(() => useUiStore.setState({ playbackTime: null }));
    act(() => useFlightStore.getState().setFlights([{ ...A, track }]));
    expect(writes.length).toBeGreaterThan(afterSeek);
    act(() => useUiStore.setState({ playbackPlaying: false, playbackTime: null }));
  });
});
