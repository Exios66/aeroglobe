import { useFilterStore, useFlightStore } from '../store';

export function useVisibleFlights() {
  const flights = useFlightStore((state) => state.flights);
  useFilterStore((state) => state.airlines);
  useFilterStore((state) => state.regions);
  useFilterStore((state) => state.altitudeRange);
  useFilterStore((state) => state.aircraftTypes);
  useFilterStore((state) => state.statuses);
  useFilterStore((state) => state.searchQuery);

  return useFilterStore.getState().filteredFlights(flights);
}
