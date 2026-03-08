import { useMemo } from 'react';
import { useFilterStore, useFlightStore } from '../store';

export function useVisibleFlights() {
  const flights = useFlightStore((state) => state.flights);
  const airlines = useFilterStore((state) => state.airlines);
  const regions = useFilterStore((state) => state.regions);
  const altitudeRange = useFilterStore((state) => state.altitudeRange);
  const aircraftTypes = useFilterStore((state) => state.aircraftTypes);
  const statuses = useFilterStore((state) => state.statuses);
  const searchQuery = useFilterStore((state) => state.searchQuery);

  return useMemo(() => {
    return useFilterStore.getState().filteredFlights(flights);
  }, [
    flights,
    airlines,
    regions,
    altitudeRange,
    aircraftTypes,
    statuses,
    searchQuery,
  ]);
}
