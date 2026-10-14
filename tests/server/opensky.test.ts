// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveAircraftStates } from '../../server/services/opensky';

describe('fetchLiveAircraftStates', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to mock when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await fetchLiveAircraftStates();
    expect(result.source).toBe('mock');
    expect(result.stale).toBe(true);
    expect(result.flights.length).toBeGreaterThan(0);
  });

  it('falls back to mock when OpenSky returns no states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ time: 0, states: [] }) }),
    );
    const result = await fetchLiveAircraftStates();
    expect(result.source).toBe('mock');
    expect(result.stale).toBe(true);
    expect(result.flights.length).toBeGreaterThan(0);
  });
});
