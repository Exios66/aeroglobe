// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockFlightDetail } from '../../server/data';
import { resolveFlightDetail } from '../../server/services/flightDetails';
import type { FlightDetail } from '../../src/types/flight';

vi.mock('../../server/data', () => ({ getMockFlightDetail: vi.fn() }));

describe('resolveFlightDetail fallback', () => {
  const sample = { flightNumber: 'SAMPLE1' } as FlightDetail;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv('AVIATIONSTACK_KEY', 'synthetic-test-key');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    vi.mocked(getMockFlightDetail).mockReset().mockReturnValue(sample);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('resolves sample detail directly when credentials are absent', async () => {
    vi.stubEnv('AVIATIONSTACK_KEY', '');
    expect(await resolveFlightDetail({ icao24: 'abc123', callsign: 'AA1' })).toBe(sample);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getMockFlightDetail).toHaveBeenCalledExactlyOnceWith('abc123');
  });

  it('uses sample detail when the callsign is unavailable', async () => {
    expect(await resolveFlightDetail({ icao24: 'abc123' })).toBe(sample);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false, status: 429 },
    { ok: true, json: async () => ({ data: [] }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => { throw new SyntaxError('invalid'); } },
  ])('uses sample detail when provider detail is unusable: %j', async (response) => {
    fetchMock.mockResolvedValue(response);
    expect(await resolveFlightDetail({ icao24: 'abc123', callsign: 'AA1' })).toBe(sample);
    expect(getMockFlightDetail).toHaveBeenCalledExactlyOnceWith('abc123');
  });

  it('returns null when both the provider and sample lookup have no detail', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    vi.mocked(getMockFlightDetail).mockReturnValue(null);
    expect(await resolveFlightDetail({ icao24: 'unknown', callsign: 'AA1' })).toBeNull();
  });

  it('returns available provider detail without consulting samples', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [{ flight: { iata: 'AA1' } }] }) });
    expect(await resolveFlightDetail({ icao24: 'abc123', callsign: 'AA1' })).toMatchObject({ flightNumber: 'AA1' });
    expect(getMockFlightDetail).not.toHaveBeenCalled();
  });
});
