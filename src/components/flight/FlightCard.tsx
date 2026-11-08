import { useEffect, useMemo, useState } from 'react';
import { fetchFlightDetail } from '../../services/aviationstack';
import { useFlightStore, useUiStore } from '../../store';
import { flightAtTime } from '../../utils/playback';
import type { Flight } from '../../types/flight';
import { FlightBadge } from './FlightBadge';
import { AircraftHistoryPanel } from './AircraftHistoryPanel';
import { useLogbookStore } from '../../logbook/logbookStore';
import {
  formatAltitude,
  formatHeading,
  formatLocalTime,
  formatSpeed,
  formatUtcTime,
} from '../../utils/format';

type FlightCardProps = {
  onViewRoute?: (flight: Flight) => void;
};

/**
 * Shows the selected flight, or nothing when it is absent from the store.
 * Loads missing route details into the store; failed requests leave partial aircraft
 * data visible. Displays playback altitude and heading and sits above an open timeline.
 * View Full Route calls onViewRoute with the selected flight only when details exist.
 */
export function FlightCard({ onViewRoute }: FlightCardProps) {
  const flights = useFlightStore((state) => state.flights);
  const selectedFlightId = useFlightStore((state) => state.selectedFlightId);
  const setFlightDetail = useFlightStore((state) => state.setFlightDetail);
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const timelineOpen = useUiStore((state) => state.timelineOpen);
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

  const displayedFlight = flightAtTime(selectedFlight, playbackTime);
  const detail = selectedFlight.detail;

  return (
    <section className={`absolute left-4 right-4 z-50 w-auto overflow-y-auto rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-glass backdrop-blur md:left-auto md:w-full md:max-w-md ${timelineOpen ? 'bottom-[calc(var(--timeline-height,12rem)+1.75rem)] max-h-[min(65vh,calc(100dvh-var(--timeline-height,12rem)-12rem))]' : 'bottom-4 max-h-[65vh]'}`}>
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
        <Stat label="Altitude" value={formatAltitude(displayedFlight.baroAltitude)} />
        <Stat label="Speed" value={formatSpeed(selectedFlight.velocity)} />
        <Stat label="Heading" value={formatHeading(displayedFlight.trueTrack)} />
        <Stat label="Status" value={detail?.status || (selectedFlight.onGround ? 'landed' : 'active')} />
        <Stat
          label="Departure"
          value={formatUtcTime(detail?.departureTime)}
          sub={detail ? formatLocalTime(detail.departureTime, detail.originTz) : undefined}
        />
        <Stat
          label="Arrival"
          value={formatUtcTime(detail?.arrivalTime)}
          sub={detail ? formatLocalTime(detail.arrivalTime, detail.destinationTz) : undefined}
        />
        <Stat label="Aircraft" value={detail?.aircraftType || 'Pending'} />
        <Stat label="Registration" value={detail?.registration || 'Pending'} />
      </div>

      <div className="mt-4 flex gap-3">
        <button type="button" disabled={!selectedFlight.track || selectedFlight.track.length < 2}
          onClick={() => {
            const track = selectedFlight.track;
            if (!track?.length) return;
            useUiStore.getState().setTimelineOpen(true);
            useUiStore.getState().setPlaybackTime(new Date(track[0].timestamp * 1000));
            useUiStore.getState().setFollowFlight(true);
          }}
          className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:bg-slate-700 disabled:text-slate-400">
          Replay track
        </button>
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
        <div className="flex items-center" />
      </div>

      <AircraftHistoryPanel icao24={selectedFlight.icao24} />
      <AddToLogbookRow
        date={isoDay(detail?.departureTime ?? null)}
        flightNumber={detail?.flightNumber || selectedFlight.callsign?.trim() || selectedFlight.icao24.toUpperCase()}
        depIcao={detail?.originIcao || null}
        arrIcao={detail?.destinationIcao || null}
        aircraftType={detail?.aircraftType || undefined}
        registration={detail?.registration || undefined}
      />
    </section>
  );
}

/** Spec §6.7: entries carry the departure day; snapshots without details cannot be logged yet. */
function isoDay(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function AddToLogbookRow(entry: {
  date: string | null;
  flightNumber: string;
  depIcao: string | null;
  arrIcao: string | null;
  aircraftType?: string;
  registration?: string;
}) {
  const [added, setAdded] = useState<string | null>(null);

  const enabled = entry.date !== null && entry.depIcao !== null && entry.arrIcao !== null;

  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      {added ? (
        <span className="text-xs text-emerald-300" role="status">Logged to your personal logbook.</span>
      ) : (
        <span className="text-xs text-slate-500">
          Clicking any aircraft recenters the globe.
        </span>
      )}
      <button
        type="button"
        disabled={!enabled}
        onClick={() => {
          if (entry.date === null || entry.depIcao === null || entry.arrIcao === null) return;
          void useLogbookStore.getState().add({
            date: entry.date,
            flightNumber: entry.flightNumber,
            depIcao: entry.depIcao,
            arrIcao: entry.arrIcao,
            aircraftType: entry.aircraftType,
            registration: entry.registration,
          }).then((logged) => setAdded(logged.flightNumber ?? logged.id));
        }}
        className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Add to logbook
      </button>
    </div>
  );
}
function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
      <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="text-sm text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
