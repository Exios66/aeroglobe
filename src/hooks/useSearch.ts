import { useQuery } from '@tanstack/react-query';
import Fuse from 'fuse.js';
import { useMemo } from 'react';
import { searchFlights, shouldPollApi } from '../services/api';
import { useFlightStore, useCatalogStore } from '../store';
import type { FlightSearchResult } from '../types/flight';
import { SEARCH_DEBOUNCE_MS } from '../utils/constants';
import { searchFlightIndex } from '../search/routeQuery';
import { useDebouncedValue } from './useDebouncedValue';

/** Merges index-first results with fuse matches over the loaded hour, deduped, index hits ranked first. */
export function mergeSearchResults(indexResults: FlightSearchResult[], fuseResults: FlightSearchResult[]): FlightSearchResult[] {
  const seen = new Set<string>();
  const merged: FlightSearchResult[] = [];
  for (const result of [...indexResults, ...fuseResults]) {
    if (seen.has(result.icao24)) continue;
    seen.add(result.icao24);
    merged.push(result);
  }
  return merged.slice(0, 8);
}

export function useSearch(query: string) {
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const useApi = shouldPollApi(import.meta.env);
  const flights = useFlightStore((state) => state.flights);
  const records = useCatalogStore((state) => state.records);
  const airports = useCatalogStore((state) => state.airports);
  const airlines = useCatalogStore((state) => state.airlines);
  const localSearchEnabled = !useApi && debouncedQuery.trim().length > 1;
  const localIndex = useMemo(() => !localSearchEnabled ? null : new Fuse(Array.from(flights.values()), {
    keys: ['callsign', 'icao24', 'detail.flightNumber', 'detail.airline',
      'detail.originIata', 'detail.destinationIata', 'detail.originCity', 'detail.destinationCity'],
    threshold: 0.35,
  }), [flights, localSearchEnabled]);
  const localResults = useMemo<FlightSearchResult[]>(() => {
    if (!localIndex || debouncedQuery.trim().length < 2) return [];
    return localIndex.search(debouncedQuery).slice(0, 8).map(({ item: flight }) => ({
      icao24: flight.icao24,
      callsign: flight.callsign,
      airline: flight.detail?.airline || flight.originCountry,
      flightNumber: flight.detail?.flightNumber || flight.callsign?.trim() || flight.icao24.toUpperCase(),
      route: flight.detail
        ? `${flight.detail.originIata} → ${flight.detail.destinationIata}`
        : `${flight.originCountry} airspace`,
      status: flight.detail?.status || (flight.onGround ? 'landed' : 'active'),
    }));
  }, [debouncedQuery, localIndex]);
  const indexResults = useMemo<FlightSearchResult[]>(() => {
    if (!localSearchEnabled || records.length === 0) return [];
    const loadedIcao24 = new Set(flights.keys());
    return searchFlightIndex(debouncedQuery, records, airports, airlines, loadedIcao24);
  }, [debouncedQuery, records, airports, airlines, flights, localSearchEnabled]);

  const searchQuery = useQuery({
    queryKey: ['search', debouncedQuery],
    queryFn: () => searchFlights(debouncedQuery),
    enabled: useApi && debouncedQuery.trim().length > 1,
    staleTime: 10_000,
  });

  return {
    results: useApi ? searchQuery.data?.results ?? [] : mergeSearchResults(indexResults, localResults),
    source: useApi ? searchQuery.data?.source ?? null : 'snapshot',
    isSearching: useApi && searchQuery.isFetching,
    hasQuery: debouncedQuery.trim().length > 1,
  };
}
