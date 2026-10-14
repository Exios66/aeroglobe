import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightPoller } from '../../src/services/flightPoller';
import type { AircraftState } from '../../src/types/flight';

const poller = vi.hoisted(() => ({ constructor: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('../../src/services/flightPoller', () => ({
  FlightPoller: poller.constructor,
}));

const flight: AircraftState = {
  icao24: 'abc123', callsign: 'UAL1', originCountry: 'US', longitude: 0, latitude: 0,
  baroAltitude: 1000, velocity: 100, trueTrack: 90, onGround: false, lastContact: 100,
};

async function loadHook(prod: boolean, apiBase = '') {
  vi.stubEnv('PROD', prod);
  vi.stubEnv('VITE_API_BASE_URL', apiBase);
  const { useFlightStore, useUiStore } = await import('../../src/store');
  const { useFlightData } = await import('../../src/hooks/useFlightData');
  return { useFlightData, useFlightStore, useUiStore };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  poller.constructor.mockImplementation(function () {
    return { start: poller.start, stop: poller.stop };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('useFlightData polling gate', () => {
  it('is idle and never constructs a poller in a static production build', async () => {
    const { useFlightData } = await loadHook(true);
    const { result, unmount } = renderHook(useFlightData);
    expect(result.current).toMatchObject({ flights: [], isLoading: false, error: null, source: null, stale: false });
    expect(poller.constructor).not.toHaveBeenCalled();
    unmount();
    expect(poller.stop).not.toHaveBeenCalled();
  });

  it('continues exposing existing store data when polling is disabled', async () => {
    const { useFlightData, useFlightStore } = await loadHook(true);
    useFlightStore.getState().setFlights([flight]);
    const { result } = renderHook(useFlightData);
    expect(result.current.flights).toEqual([flight]);
    expect(result.current.flightsMap).toBe(useFlightStore.getState().flights);
    expect(result.current.isLoading).toBe(false);
    expect(poller.constructor).not.toHaveBeenCalled();
  });

  it.each([[false, ''], [true, 'https://api.example.test']])(
    'starts and stops exactly one poller with PROD=%s and API=%s', async (prod, apiBase) => {
      const { useFlightData, useUiStore } = await loadHook(prod, apiBase);
      const { result, rerender, unmount } = renderHook(useFlightData);
      expect(result.current.isLoading).toBe(true);
      expect(poller.constructor).toHaveBeenCalledTimes(1);
      expect(poller.start).toHaveBeenCalledTimes(1);
      const callbacks = poller.constructor.mock.calls[0][0] as ConstructorParameters<typeof FlightPoller>[0];
      const time = new Date('2026-10-12T03:00:00Z');
      act(() => useUiStore.getState().setPlaybackTime(time));
      expect(callbacks.getPlaybackTime?.()).toEqual(time);
      rerender();
      expect(poller.constructor).toHaveBeenCalledTimes(1);
      unmount();
      expect(poller.stop).toHaveBeenCalledTimes(1);
    },
  );

  it('updates data and clears a prior error when an enabled poller recovers', async () => {
    const { useFlightData } = await loadHook(false);
    const { result } = renderHook(useFlightData);
    const callbacks = poller.constructor.mock.calls[0][0] as ConstructorParameters<typeof FlightPoller>[0];
    act(() => callbacks.onError?.(new Error('offline')));
    expect(result.current).toMatchObject({ error: 'offline', isLoading: false });
    act(() => callbacks.onData({ flights: [flight], source: 'mock', stale: true, fetchedAt: '2026-10-12T00:00:00Z' }));
    expect(result.current).toMatchObject({ flights: [flight], source: 'mock', stale: true, error: null, isLoading: false });
  });
});
