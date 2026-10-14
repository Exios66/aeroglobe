import { act, renderHook } from '@testing-library/react';
import type { Viewer } from 'cesium';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGlobe } from '../../src/hooks/useGlobe';
import { useFlightStore } from '../../src/store';
import type { AircraftState, FlightDetail } from '../../src/types/flight';
import { clearFlightPaths } from '../../src/globe/paths';
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
} as unknown as Viewer;

afterEach(() => {
  act(() => {
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
  });
  vi.clearAllMocks();
});

describe('useGlobe camera', () => {
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
