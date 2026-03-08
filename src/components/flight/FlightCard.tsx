import { useEffect, useMemo, useState } from 'react';
import { fetchFlightDetail } from '../../services/aviationstack';
import { useFlightStore } from '../../store';
import type { Flight } from '../../types/flight';
import { FlightBadge } from './FlightBadge';
import {
  formatAltitude,
  formatHeading,
  formatSpeed,
  formatUtcTime,
} from '../../utils/format';

type FlightCardProps = {
  onViewRoute?: (flight: Flight) => void;
};

export function FlightCard({ onViewRoute }: FlightCardProps) {
  const flights = useFlightStore((state) => state.flights);
  const selectedFlightId = useFlightStore((state) => state.selectedFlightId);
  const setFlightDetail = useFlightStore((state) => state.setFlightDetail);
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const [loading, setLoading] = useState(false);

  const selectedFlight = useMemo(() => {
    return selectedFlightId ? flights.get(selectedFlightId) ?? null : null;
  }, [flights, selectedFlightId]);

  useEffect(() => {
    if (!selectedFlight || selectedFlight.detail) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    void fetchFlightDetail(selectedFlight.icao24, selectedFlight.callsign)
      .then((detail) => {
        if (!cancelled && detail) {
          setFlightDetail(selectedFlight.icao24, detail);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFlight, setFlightDetail]);

  if (!selectedFlight) {
    return null;
  }

  const detail = selectedFlight.detail;

  return (
    <section className="absolute bottom-4 left-4 right-4 z-50 w-auto rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-glass backdrop-blur md:left-auto md:w-full md:max-w-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">
            {detail?.airline || selectedFlight.originCountry}
          </div>
          <div className="mt-2">
            <FlightBadge
              airline={detail?.airlineIata || detail?.airline || selectedFlight.originCountry}
              flightNumber={
                detail?.flightNumber ||
                selectedFlight.callsign?.trim() ||
                selectedFlight.icao24.toUpperCase()
              }
            />
          </div>
          <div className="text-2xl font-semibold text-white">
            {detail?.flightNumber || selectedFlight.callsign?.trim() || selectedFlight.icao24.toUpperCase()}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {detail
              ? `${detail.originCity} (${detail.originIata}) -> ${detail.destinationCity} (${detail.destinationIata})`
              : 'Resolving route details...'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => selectFlight(null)}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:text-white"
        >
          Close
        </button>
      </div>

      {loading && (
        <div className="mb-4 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-slate-400">
          Loading route metadata and schedule...
        </div>
      )}
      {!loading && !detail && (
        <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
          Route details unavailable. Showing partial aircraft data from the live feed.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm text-slate-200">
        <Stat label="Altitude" value={formatAltitude(selectedFlight.baroAltitude)} />
        <Stat label="Speed" value={formatSpeed(selectedFlight.velocity)} />
        <Stat label="Heading" value={formatHeading(selectedFlight.trueTrack)} />
        <Stat label="Status" value={detail?.status || (selectedFlight.onGround ? 'landed' : 'active')} />
        <Stat label="Departure" value={formatUtcTime(detail?.departureTime)} />
        <Stat label="Arrival" value={formatUtcTime(detail?.arrivalTime)} />
        <Stat label="Aircraft" value={detail?.aircraftType || 'Pending'} />
        <Stat label="Registration" value={detail?.registration || 'Pending'} />
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => {
            if (selectedFlight.detail) {
              onViewRoute?.(selectedFlight);
            }
          }}
          disabled={!selectedFlight.detail}
          className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          View Full Route
        </button>
        <div className="flex items-center text-xs text-slate-500">
          Clicking any aircraft recenters the globe.
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
      <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}
