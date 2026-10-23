import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSearch } from '../../src/hooks/useSearch';
import { useFlightStore } from '../../src/store/flightStore';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>;
}

describe('useSearch', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null, lastUpdated: null });
  });

  it('searches the full static snapshot without requesting an unavailable API', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    useFlightStore.getState().setFlights(Array.from({ length: 250 }, (_, index) => ({
      icao24: index.toString(16).padStart(6, '0'),
      callsign: index === 249 ? 'QQE935' : `UAL${index}`,
      originCountry: 'United States',
      longitude: -100,
      latitude: 40,
      baroAltitude: 10_000,
      velocity: 240,
      trueTrack: 90,
      onGround: false,
      lastContact: 1,
    })));
    const { result } = renderHook(() => useSearch('QQE935'), { wrapper });
    await waitFor(() => expect(result.current.results[0]?.callsign).toBe('QQE935'));
    expect(result.current.source).toBe('snapshot');
    expect(result.current.isSearching).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('continues to use the API in development', async () => {
    vi.stubEnv('PROD', false);
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [], source: 'opensky' }) });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useSearch('QQE935'), { wrapper });
    await waitFor(() => expect(result.current.source).toBe('opensky'));
    expect(fetch).toHaveBeenCalledWith('/api/search?q=QQE935');
  });
});
