import { useQuery } from '@tanstack/react-query';
import { searchFlights } from '../services/api';
import { SEARCH_DEBOUNCE_MS } from '../utils/constants';
import { useDebouncedValue } from './useDebouncedValue';

export function useSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchFlights(debouncedQuery),
    enabled: debouncedQuery.trim().length > 1,
    staleTime: 10_000,
  });

  return {
    results: searchQuery.data?.results ?? [],
    source: searchQuery.data?.source ?? null,
    isSearching: searchQuery.isFetching,
    hasQuery: debouncedQuery.trim().length > 1,
  };
}
