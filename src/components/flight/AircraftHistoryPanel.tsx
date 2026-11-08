import { useState } from 'react';
import {
  flightDurationMinutes,
  flightsOfAirframe,
  hourOf,
} from '../../services/flightHistory';
import type { FlightRecord } from '../../services/staticData';
import { useCatalogStore } from '../../store';
import { useFlightStore } from '../../store/flightStore';
import { useUiStore } from '../../store/uiStore';
import { formatUtcTime } from '../../utils/format';
import { Button } from '../ui/Button';

type AircraftHistoryPanelProps = {
  /** Rows are hidden when this airframe has no other indexed flights. */
  icao24: string | null;
};

/**
 * Lists every flight of the selected airframe in the loaded day's index (earliest first).
 * Choosing a row selects the airframe, jumps the timeline into that flight's departure hour,
 * and starts playback at its departure time; the loaded data hour follows the selection.
 */
export function AircraftHistoryPanel({ icao24 }: AircraftHistoryPanelProps) {
  const [open, setOpen] = useState(true);
  const records = useCatalogStore((state) => state.records);
  const selectFlight = useFlightStore((state) => state.selectFlight);
  const flight = useFlightStore((state) => (icao24 ? state.flights.get(icao24) : undefined));

  if (!icao24) {
    return null;
  }

  const history = flightsOfAirframe(records, icao24);
  if (history.length === 0) {
    return null;
  }

  const trackStart = flight?.track?.[0]?.timestamp;

  return (
    <section aria-label="Aircraft history" className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Aircraft history ({history.length})
        </h3>
        <Button variant="ghost" className="text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Show'}
        </Button>
      </div>
      {open && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
          {history.map((record) => (
            <HistoryRow
              key={record.id}
              record={record}
              active={trackStart !== undefined && trackStart >= record.dep.t && trackStart <= record.arr.t}
              onSeek={() => seekToFlight(record, selectFlight)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function HistoryRow({
  record,
  active,
  onSeek,
}: {
  record: FlightRecord;
  active: boolean;
  onSeek: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSeek}
        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-white/5 ${active ? 'bg-white/5' : ''}`}
      >
        <span className="text-sm text-white">
          {record.cs?.trim() || record.icao24.toUpperCase()}
          <span className="ml-2 text-xs text-slate-400">{record.dep.ap ?? '—'} → {record.arr.ap ?? '—'}</span>
        </span>
        <span className="text-right text-xs text-slate-400">
          <span>{formatUtcTime(new Date(record.dep.t * 1000).toISOString())}</span>
          <span className="ml-2 text-slate-500">{flightDurationMinutes(record)} min</span>
        </span>
      </button>
    </li>
  );
}

/** Selects the airframe and seeks the clock into that flight's departure hour. */
export function seekToFlight(record: FlightRecord, selectFlight: (icao24: string | null) => void): void {
  const ui = useUiStore.getState();
  const depHour = hourOf(record.dep.t);
  const depTime = new Date(record.dep.t * 1000);
  selectFlight(record.icao24);
  ui.setTimelineOpen(true);
  if (ui.loadedHour === depHour) {
    ui.setPlaybackTime(depTime);
    ui.setPlaybackPlaying(true);
  } else {
    // setSelectedHour pauses playback and the async hour load resets the clock to the hour
    // start, so the departure time (and the playing intent) ride along as a pending seek and
    // are applied after the chunk lands.
    ui.setPendingSeek({ time: depTime, playing: true });
    ui.setSelectedHour(depHour);
  }
}
