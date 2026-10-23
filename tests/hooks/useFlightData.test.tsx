import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightPoller } from '../../src/services/flightPoller';
import type { AircraftState } from '../../src/types/flight';
import { staticDataFixtures, stubStaticDataFetch } from '../helpers/staticData';

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
  vi.unstubAllGlobals();
});

describe('useFlightData polling gate', () => {
  it('loads the newest static hour chunk in a production build without an API base', async () => {
    stubStaticDataFetch();
    const { useFlightData, useFlightStore } = await loadHook(true);
    const { result } = renderHook(useFlightData);
    await waitFor(() => expect(useFlightStore.getState().flights.size).toBe(1));
    expect(result.current.source).toBe('snapshot');
    expect(useFlightStore.getState().lastUpdated?.getTime()).toBe((1760227200 + 60) * 1000);
    const loaded = useFlightStore.getState().flights.get('abc123');
    expect(loaded?.detail).toMatchObject({ airline: 'United Airlines', originIata: 'ORD' });
    expect(loaded).toMatchObject({ callsign: 'UAL1', latitude: 40.6, longitude: -73.7, baroAltitude: 10000 / 3.28084, trueTrack: 80 });
    expect(poller.constructor).not.toHaveBeenCalled();
  });

  it('reports a load error without throwing when the static catalog is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const { useFlightData } = await loadHook(true);
    const { result } = renderHook(useFlightData);
    await waitFor(() => expect(result.current.error).toMatch(/catalog\.json request failed/));
    expect(result.current).toMatchObject({ isLoading: false, source: 'static' });
    expect(poller.constructor).not.toHaveBeenCalled();
  });

  it('leaves the update time unknown when the static hour contains no aircraft', async () => {
    const fixtures = staticDataFixtures();
    fixtures.chunk.a = [];
    fixtures.catalog.days[0].hours[0].aircraft = 0;
    stubStaticDataFetch(fixtures);
    const { useFlightData } = await loadHook(true);
    const { result } = renderHook(useFlightData);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({ flights: [], lastUpdated: null, source: 'snapshot', error: null });
  });

  it('keeps existing store data while the static fetch is in flight', async () => {
    stubStaticDataFetch();
    const { useFlightData, useFlightStore } = await loadHook(true);
    useFlightStore.getState().setFlights([flight]);
    const { result } = renderHook(useFlightData);
    expect(result.current.flights).toEqual([flight]);
    expect(result.current.flightsMap).toBe(useFlightStore.getState().flights);
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
