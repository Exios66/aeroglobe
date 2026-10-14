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
import { TopBar } from './TopBar';

export function Shell() {
  const { lastUpdated, source, isLoading, error } = useFlightData();
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
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0">
        <ErrorBoundary>
          <GlobeViewer onReady={setViewer} />
        </ErrorBoundary>
      </div>

      <TopBar liveCount={visibleFlights.length} lastUpdated={lastUpdated} source={source} />

      <div className="absolute inset-x-4 top-24 z-50 flex justify-center">
        <SearchBar />
      </div>

      <FilterPanel />
      <FlightList />
      <FlightCard onViewRoute={handleViewRoute} />
      {timelineOpen && <TimeScrubber />}

      {(isLoading || error) && (
        <div className="absolute bottom-4 left-4 z-50 max-w-md rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 text-sm shadow-glass backdrop-blur">
          {isLoading && <div className="text-slate-300">Loading global flight traffic...</div>}
          {error && <div className="text-amber-300">{error}</div>}
        </div>
      )}
    </div>
  );
}
