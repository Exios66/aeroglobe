import { useEffect, useMemo, useRef, useState } from 'react';
import { fromCsv, fromJson, isImportable, toCsv, toJson } from '../../logbook/csvImportExport';
import { useLogbookStore } from '../../logbook/logbookStore';
import { logbookStats } from '../../logbook/stats';
import { seekToFlight } from '../flight/AircraftHistoryPanel';
import { Button } from '../ui/Button';
import { useCatalogStore, useFlightStore, useUiStore } from '../../store';
import type { AirportRow } from '../../services/staticData';

/**
 * Local-first personal logbook (spec §6.7): stats header, entry rows with replay links,
 * JSON/CSV import/export, and a clean-slate reset. Opened from the TopBar.
 */
export function LogbookPanel() {
  const panelOpen = useLogbookStore((state) => state.panelOpen);
  const setPanelOpen = useLogbookStore((state) => state.setPanelOpen);
  const timelineOpen = useUiStore((state) => state.timelineOpen);
  const { entries, loaded, loadError, load, remove, importEntries, reset } = useLogbookStore();
  const records = useCatalogStore((state) => state.records);
  const airports = useCatalogStore((state) => state.airports);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (panelOpen && !loaded && !loadError) {
      void load();
    }
  }, [panelOpen, loaded, loadError, load]);

  const linkedFlights = useMemo(() => new Map(records.map((record) => [record.id, record])), [records]);
  const stats = useMemo(() => logbookStats(entries, airports, linkedFlights), [entries, airports, linkedFlights]);
  const openWithArcs = panelOpen;

  if (!openWithArcs) return null;

  const handleExportJson = () => download('aeroglobe-logbook.json', toJson(entries), 'application/json');
  const handleExportCsv = () => download('aeroglobe-logbook.csv', toCsv(entries), 'text/csv');

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const imported = /\.csv$/i.test(file.name) ? fromCsv(text) : fromJson(text);
      const usable = imported.filter(isImportable);
      await importEntries(usable);
      setError(usable.length === imported.length ? null : `${imported.length - usable.length} incomplete row(s) skipped`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'import failed');
    }
  };

  return (
    <section
      role="dialog"
      aria-label="Personal logbook"
      className={timelineOpen
        ? 'absolute left-1/2 z-40 w-[min(96vw,44rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-glass backdrop-blur bottom-[calc(var(--timeline-height,12rem)+1.75rem)] max-h-[min(60vh,calc(100dvh-var(--timeline-height,12rem)-12rem))] overflow-y-auto'
        : 'absolute left-1/2 z-40 w-[min(96vw,44rem)] -translate-x-1/2 rounded-3xl border border-white/10 bg-slate-950/90 p-5 shadow-glass backdrop-blur bottom-4 max-h-[75vh] overflow-y-auto'}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Personal logbook</h2>
          <p className="text-xs text-slate-400">Stored locally in your browser. Nothing leaves this machine.</p>
        </div>
        <Button variant="ghost" onClick={() => setPanelOpen(false)}>Close</Button>
      </header>

      {stats.count > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm md:grid-cols-6">
          <Stat label="Flights" value={stats.count.toLocaleString()} />
          <Stat label="Distance" value={`${Math.round(stats.km).toLocaleString()} km`} />
          <Stat label="Hours" value={stats.hours > 0 ? stats.hours.toFixed(1) : '—'} />
          <Stat label="Airports" value={stats.airports.size.toLocaleString()} />
          <Stat label="Countries" value={stats.countries.size.toLocaleString()} />
          <Stat label="Longest" value={stats.longestEntry ? `${Math.round(stats.longestKm).toLocaleString()} km` : '—'} />
        </div>
      )}

      {loadError && (
        <div className="mb-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200">
          {loadError}
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-200" role="alert">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
          No flights logged yet. Select a flight and press “Add to logbook”, or import a file below.
        </div>
      ) : (
        <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-white">
                  {entry.date} · {entry.flightNumber || 'Flight'} · {airportCodeLabel(entry.depIcao, airports)} → {airportCodeLabel(entry.arrIcao, airports)}
                </div>
                {(entry.aircraftType || entry.registration || entry.seat) && (
                  <div className="truncate text-xs text-slate-400">
                    {[entry.aircraftType, entry.registration, entry.seat].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {entry.linkedFlightId && linkedFlights.get(entry.linkedFlightId) && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const record = linkedFlights.get(entry.linkedFlightId as string);
                      if (record) {
                        seekToFlight(record, useFlightStore.getState().selectFlight);
                        setPanelOpen(false);
                      }
                    }}
                  >
                    Replay
                  </Button>
                )}
                <Button variant="ghost" onClick={() => void remove(entry.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="flex flex-wrap items-center gap-2">
        <Button onClick={handleExportJson}>Export JSON</Button>
        <Button onClick={handleExportCsv}>Export CSV</Button>
        <Button onClick={() => fileInputRef.current?.click()}>Import file</Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImportFile(file);
            event.target.value = '';
          }}
        />
        <Button
          variant="ghost"
          disabled={entries.length === 0}
          onClick={() => {
            if (window.confirm('Delete every logbook entry on this device? This cannot be undone.')) {
              void reset();
            }
          }}
        >
          Clear all
        </Button>
      </footer>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="text-sm text-white">{value}</div>
    </div>
  );
}

/** Rows speak IATA where airports are known, ICAO otherwise (entries store ICAO). */
function airportCodeLabel(icao: string | null, airports: Map<string, AirportRow>): string {
  if (!icao) return '—';
  return airports.get(icao)?.[1] ?? icao;
}

export function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
