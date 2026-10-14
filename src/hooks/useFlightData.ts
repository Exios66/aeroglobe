import { useEffect, useMemo, useState } from 'react';
import { useFlightStore, useUiStore } from '../store';
import { FlightPoller } from '../services/flightPoller';
import { shouldPollApi } from '../services/api';
import { dataBaseUrl, loadLatestStates } from '../services/staticData';

const POLLING_ENABLED = shouldPollApi(import.meta.env);

type FlightDataState = {
  isLoading: boolean;
  error: string | null;
  source: string | null;
  stale: boolean;
};

/**
 * Returns stored flights, update/playback times, and load status. While mounted, polls the API
 * and updates the flight store unless this is a production build without an API base URL;
 * in that case it loads the newest prebuilt hour chunk from the static data directory and
 * reports the source. Caught errors become status messages; existing flights remain.
 */
export function useFlightData() {
  const flights = useFlightStore((state) => state.flights);
  const lastUpdated = useFlightStore((state) => state.lastUpdated);
  const setFlights = useFlightStore((state) => state.setFlights);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const [status, setStatus] = useState<FlightDataState>({
    isLoading: POLLING_ENABLED && flights.size === 0,
    error: null,
    source: POLLING_ENABLED ? null : 'static',
    stale: false,
  });

  useEffect(() => {
    if (POLLING_ENABLED) return undefined;

    let cancelled = false;
    const base = dataBaseUrl(import.meta.env);
    setStatus((current) => ({ ...current, isLoading: true, error: null }));

    void (async () => {
      try {
        const { states, day } = await loadLatestStates(base);
        if (cancelled) return;
        setFlights(states);
        setStatus({ isLoading: false, error: null, source: day.source, stale: false });
      } catch (error) {
        if (cancelled) return;
        setStatus((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error.message : 'static data failed to load',
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setFlights]);

  useEffect(() => {
    if (!POLLING_ENABLED) return undefined;

    const poller = new FlightPoller({
      getPlaybackTime: () => useUiStore.getState().playbackTime,
      onData: (response) => {
        setFlights(response.flights);
        setStatus({
          isLoading: false,
          error: null,
          source: response.source,
          stale: response.stale,
        });
      },
      onError: (error) => {
        setStatus((current) => ({
          ...current,
          isLoading: false,
          error: error.message,
        }));
      },
    });

    poller.start();
    return () => {
      poller.stop();
    };
  }, [setFlights]);

  const flightList = useMemo(() => Array.from(flights.values()), [flights]);

  return {
    flights: flightList,
    flightsMap: flights,
    lastUpdated,
    playbackTime,
    ...status,
  };
}
