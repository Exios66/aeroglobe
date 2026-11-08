import { useCatalogStore, useFlightStore } from '../../store';
import { useSearch } from '../../hooks/useSearch';
import { seekToFlight } from '../flight/AircraftHistoryPanel';
import { flightsOfAirframe } from '../../services/flightHistory';
import { cn } from '../../utils/cn';

type SearchResultsProps = {
  query: string;
  onSelect?: () => void;
};

export function SearchResults({ query, onSelect }: SearchResultsProps) {
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const records = useCatalogStore((state) => state.records);
  const { results, isSearching, hasQuery } = useSearch(query);

  /** Loaded aircraft select directly; index-only flights seek into their departure hour instead. */
  const choose = (icao24: string) => {
    if (useFlightStore.getState().flights.has(icao24)) {
      selectFlight(icao24);
      onSelect?.();
      return;
    }
    const record = flightsOfAirframe(records, icao24)[0];
    if (record) {
      seekToFlight(record, selectFlight);
      onSelect?.();
    } else {
      selectFlight(icao24);
      onSelect?.();
    }
  };

  if (!hasQuery) {
    return null;
  }

  return (
    <div
      id="aeroglobe-search-listbox"
      role="listbox"
      aria-label="Search results"
      className="absolute left-0 right-0 top-full mt-3 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-glass backdrop-blur"
    >
      {isSearching && (
        <div className="px-3 py-4 text-sm text-slate-400">Searching active flights...</div>
      )}

      {!isSearching && results.length === 0 && (
        <div className="px-3 py-4 text-sm text-slate-400">No matching flights found.</div>
      )}

      <div className="space-y-1">
        {results.map((result) => (
          <button
            key={result.icao24}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => {
              choose(result.icao24);
            }}
            className={cn(
              'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left',
              'transition hover:bg-white/5',
            )}
          >
            <div>
              <div className="text-sm font-medium text-white">
                {result.airline} {result.flightNumber}
              </div>
              <div className="text-xs text-slate-400">{result.route}</div>
            </div>
            <div className="text-right text-xs text-slate-300">
              <div>{result.callsign || 'Unknown'}</div>
              <div className="capitalize text-slate-500">{result.status}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
