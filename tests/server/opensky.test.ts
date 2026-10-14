// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveAircraftStates } from '../../server/services/opensky';

describe('fetchLiveAircraftStates', () => {
  it.each([
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ states: null }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => ({ states: [[null, null, null]] }) },
    { ok: true, json: async () => { throw new SyntaxError('bad JSON'); } },
  ])('returns stale sample data for unusable provider responses: %j', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const result = await fetchLiveAircraftStates();
    expect(result).toMatchObject({ source: 'mock', stale: true });
    expect(result.flights.length).toBeGreaterThan(0);
  });

  it('keeps live data when at least one state is usable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ states: [
        [null, null, null],
        ['abc123', ' UAL1 ', 'US', 100, 100, 0, 0, 1000, false, 200, 90],
      ] }),
    }));
    expect(await fetchLiveAircraftStates()).toEqual({
      source: 'opensky', stale: false,
      flights: [{ icao24: 'abc123', callsign: 'UAL1', originCountry: 'US', lastContact: 100,
        longitude: 0, latitude: 0, baroAltitude: 1000, onGround: false, velocity: 200, trueTrack: 90 }],
    });
  });

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
