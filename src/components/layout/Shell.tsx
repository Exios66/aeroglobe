import type { Viewer } from 'cesium';
import { useCallback, useState } from 'react';
import { FilterPanel } from '../filters/FilterPanel';
import { FlightCard } from '../flight/FlightCard';
import { FlightList } from '../flight/FlightList';
import { SearchBar } from '../search/SearchBar';
import { useFlightData } from '../../hooks/useFlightData';
import { useGlobe } from '../../hooks/useGlobe';
import { useVisibleFlights } from '../../hooks/useVisibleFlights';
import { GlobeViewer } from '../../globe/GlobeViewer';
import { flyToRoute } from '../../globe/camera';
import { useUiStore } from '../../store';
import type { Flight } from '../../types/flight';
import { TimeScrubber } from '../timeline/TimeScrubber';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { TzHoverChip } from '../globe/TzHoverChip';
import { LogbookPanel } from '../logbook/LogbookPanel';
import { TopBar } from './TopBar';

/** Connects flight polling and globe state to the search, filters, flight details, and optional timeline UI. */
export function Shell() {
  const { lastUpdated, source, isLoading, error, retry } = useFlightData();
  const visibleFlights = useVisibleFlights();
  const timelineOpen = useUiStore((state) => state.timelineOpen);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  useGlobe(viewer);

  const handleViewRoute = useCallback(
    (flight: Flight) => {
      if (!viewer || !flight.detail?.originCoordinates || !flight.detail.destinationCoordinates) {
        return;
      }

      flyToRoute(viewer, flight.detail.originCoordinates, flight.detail.destinationCoordinates);
    },
    [viewer],
  );

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0">
        <ErrorBoundary>
          <GlobeViewer onReady={setViewer} />
        </ErrorBoundary>
      </div>

      <TopBar liveCount={visibleFlights.length} lastUpdated={lastUpdated} source={source} />

      <div className="pointer-events-none absolute inset-x-3 top-[7.25rem] z-30 flex justify-center md:inset-x-4 md:top-40 md:z-50 max-md:top-[10.5rem]">
        <div className="pointer-events-auto w-full max-w-xl">
          <SearchBar />
        </div>
      </div>

      <FilterPanel />
      <FlightList />
      <FlightCard onViewRoute={handleViewRoute} />
      {timelineOpen && <TimeScrubber />}
      <TzHoverChip />
      <LogbookPanel />

      {(isLoading || error) && (
        <div className="absolute bottom-4 left-4 z-50 max-w-md rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-sm shadow-glass backdrop-blur">
          {isLoading && <div className="text-slate-300">Loading global flight traffic...</div>}
          {error && (
            <div className="flex items-center gap-3">
              <span className="text-amber-300">{error}</span>
              <button
                type="button"
                onClick={retry}
                className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-200 transition hover:text-white"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
