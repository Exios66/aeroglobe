import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_BACKOFF_MS } from '../../src/utils/constants';
import { FlightPoller } from '../../src/services/flightPoller';
import { fetchLiveFlights } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({
  fetchLiveFlights: vi.fn(),
}));

const fetchLiveFlightsMock = vi.mocked(fetchLiveFlights);

describe('FlightPoller backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('backs off after failures and resumes polling at the backoff delay', async () => {
    fetchLiveFlightsMock.mockRejectedValueOnce(new Error('429 gone'));
    fetchLiveFlightsMock.mockResolvedValue({
      flights: [],
      source: 'mock',
      stale: false,
      fetchedAt: new Date().toISOString(),
    });
    const onData = vi.fn();
    const onError = vi.fn();
    const poller = new FlightPoller({ onData, onError });

    poller.start();
    await vi.advanceTimersByTimeAsync(0); // flush the failed poll's scheduling

    // The failure schedules the next attempt at the backoff delay instead of the normal interval.
    expect(vi.getTimerCount()).toBe(1);
    expect(fetchLiveFlightsMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RATE_LIMIT_BACKOFF_MS);
    expect(fetchLiveFlightsMock).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('stops scheduling after stop()', async () => {
    fetchLiveFlightsMock.mockRejectedValue(new Error('down'));
    const poller = new FlightPoller({ onData: vi.fn(), onError: vi.fn() });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    poller.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_BACKOFF_MS * 3);
    // No further polls after stop.
    expect(fetchLiveFlightsMock).toHaveBeenCalledTimes(1);
  });
});
