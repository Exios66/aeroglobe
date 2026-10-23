import { useMemo } from 'react';
import { useFilterStore, useFlightStore } from '../store';

export function useVisibleFlights() {
  const flights = useFlightStore((state) => state.flights);
  const filters = useFilterStore();
  return useMemo(() => filters.filteredFlights(flights), [filters, flights]);
}
