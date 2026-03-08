import { FLIGHT_POLL_INTERVAL_MS, RATE_LIMIT_BACKOFF_MS } from '../utils/constants';
import { fetchLiveFlights, type LiveFlightsResponse } from './api';

type FlightPollerCallbacks = {
  onData: (response: LiveFlightsResponse) => void;
  onError?: (error: Error) => void;
  getPlaybackTime?: () => Date | null;
};

export class FlightPoller {
  private timerId: number | null = null;
  private currentDelayMs = FLIGHT_POLL_INTERVAL_MS;
  private running = false;

  constructor(private callbacks: FlightPollerCallbacks) {}

  start(intervalMs = FLIGHT_POLL_INTERVAL_MS): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.currentDelayMs = intervalMs;
    void this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timerId != null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) {
      return;
    }

    if (this.timerId != null) {
      window.clearTimeout(this.timerId);
    }

    this.timerId = window.setTimeout(() => {
      void this.poll();
    }, delayMs);
  }

  private async poll(): Promise<void> {
    try {
      const playbackTime = this.callbacks.getPlaybackTime?.() ?? null;
      const response = await fetchLiveFlights(playbackTime);
      this.currentDelayMs = FLIGHT_POLL_INTERVAL_MS;
      this.callbacks.onData(response);
      this.scheduleNext(this.currentDelayMs);
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error('Unable to refresh live flight data.');
      this.callbacks.onError?.(normalizedError);
      this.currentDelayMs = RATE_LIMIT_BACKOFF_MS;
      this.scheduleNext(this.currentDelayMs);
    }
  }
}
