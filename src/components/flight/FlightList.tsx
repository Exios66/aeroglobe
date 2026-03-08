import { useMemo } from 'react';
import { useVisibleFlights } from '../../hooks/useVisibleFlights';
import { useFlightStore, useUiStore } from '../../store';
import { formatAltitude, formatFlightCount, formatSpeed } from '../../utils/format';
import { cn } from '../../utils/cn';

export function FlightList() {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const flights = useVisibleFlights();

  const sortedFlights = useMemo(() => {
    return [...flights].sort((left, right) => (right.baroAltitude ?? 0) - (left.baroAltitude ?? 0));
  }, [flights]);

  return (
    <aside
      className={cn(
        'absolute right-4 top-20 z-40 flex h-[calc(100vh-7rem)] w-80 flex-col rounded-3xl border border-white/10 bg-slate-950/85 p-4 shadow-glass backdrop-blur transition',
        sidebarOpen ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0',
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Air Traffic</div>
          <div className="text-xs text-slate-400">{formatFlightCount(sortedFlights.length)}</div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:text-white"
        >
          Hide
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto pr-1">
        {sortedFlights.map((flight) => (
          <button
            key={flight.icao24}
            type="button"
            onClick={() => selectFlight(flight.icao24)}
            className="w-full rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.05]"
          >
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-white">
                {flight.callsign?.trim() || flight.icao24.toUpperCase()}
              </div>
              <div className="text-xs text-slate-400">
                {flight.detail?.airlineIata || flight.originCountry}
              </div>
            </div>
            <div className="mb-2 text-xs text-slate-400">
              {flight.detail
                ? `${flight.detail.originIata} -> ${flight.detail.destinationIata}`
                : `${flight.originCountry} airspace`}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>{formatAltitude(flight.baroAltitude)}</span>
              <span>{formatSpeed(flight.velocity)}</span>
            </div>
          </button>
        ))}

        {sortedFlights.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
            No flights match the current filters.
          </div>
        )}
      </div>
    </aside>
  );
}
