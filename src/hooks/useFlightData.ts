import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFlightStore, useUiStore, useCatalogStore } from '../store';
import { FlightPoller } from '../services/flightPoller';
import { shouldPollApi } from '../services/api';
import { dataBaseUrl, hourCounts, loadLatestStates } from '../services/staticData';

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
 * `retry` re-runs the static load after a failure (spec §7 catalog failure → retry).
 */
export function useFlightData() {
  const flights = useFlightStore((state) => state.flights);
  const lastUpdated = useFlightStore((state) => state.lastUpdated);
  const setFlights = useFlightStore((state) => state.setFlights);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const selectedDataDay = useUiStore((state) => state.selectedDataDay);
  const selectedHour = useUiStore((state) => state.selectedHour);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
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
        const { states, day, days, hour, records, airports, airlines, unavailableHours } = await loadLatestStates(
          base,
          selectedDataDay,
          selectedHour,
        );
        if (cancelled) return;
        const latestContact = states.reduce(
          (latest, state) => Number.isFinite(state.lastContact) ? Math.max(latest, state.lastContact) : latest,
          -Infinity,
        );
        setFlights(states, Number.isFinite(latestContact) ? new Date(latestContact * 1000) : null);
        useCatalogStore.getState().setIndex(records, airports, airlines, day.date);
        const ui = useUiStore.getState();
        ui.setDataDays(days.map(({ date, source }) => ({ date, source })));
        const counts = hourCounts(day.hours);
        for (const failed of unavailableHours) if (failed >= 0 && failed < 24) counts[failed] = 0;
        ui.setDayHours(counts);
        ui.setLoadedHour(hour.h);
        ui.setPlaybackPlaying(false);
        const uiState = useUiStore.getState();
        const pendingSeek = uiState.pendingSeek;
        if (pendingSeek) {
          ui.setPendingSeek(null);
          ui.setPlaybackTime(pendingSeek.time);
          ui.setPlaybackPlaying(pendingSeek.playing);
        } else {
          ui.setPlaybackTime(selectedHour == null
            ? null
            : new Date(Date.parse(`${day.date}T${String(hour.h).padStart(2, '0')}:00:00.000Z`)));
        }
        const degraded = unavailableHours.length > 0 ? `; hour ${unavailableHours.join(', ')} unavailable` : '';
        setStatus({
          isLoading: false,
          error: null,
          source: `${day.source === 'opensky' ? 'snapshot' : day.source}${degraded}`,
          stale: false,
        });
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
  }, [selectedDataDay, selectedHour, attempt, setFlights]);

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
    retry,
    ...status,
  };
}
