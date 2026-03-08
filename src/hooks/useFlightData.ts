import { useEffect, useMemo, useState } from 'react';
import { useFlightStore, useUiStore } from '../store';
import { FlightPoller } from '../services/flightPoller';

type FlightDataState = {
  isLoading: boolean;
  error: string | null;
  source: string | null;
  stale: boolean;
};

export function useFlightData() {
  const flights = useFlightStore((state) => state.flights);
  const lastUpdated = useFlightStore((state) => state.lastUpdated);
  const setFlights = useFlightStore((state) => state.setFlights);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const [status, setStatus] = useState<FlightDataState>({
    isLoading: flights.size === 0,
    error: null,
    source: null,
    stale: false,
  });

  useEffect(() => {
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
