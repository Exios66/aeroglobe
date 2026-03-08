import { useFlightStore, useFilterStore, useUiStore } from '../../store';
import { AirlineFilter } from './AirlineFilter';
import { AltitudeFilter } from './AltitudeFilter';
import { RegionFilter } from './RegionFilter';
import { StatusFilter } from './StatusFilter';
import { cn } from '../../utils/cn';

function toggleValue(items: string[], value: string): string[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function FilterPanel() {
  const flights = useFlightStore((state) => Array.from(state.flights.values()));
  const filterPanelOpen = useUiStore((state) => state.filterPanelOpen);
  const setFilterPanelOpen = useUiStore((state) => state.setFilterPanelOpen);
  const airlines = useFilterStore((state) => state.airlines);
  const altitudeRange = useFilterStore((state) => state.altitudeRange);
  const aircraftTypes = useFilterStore((state) => state.aircraftTypes);
  const regions = useFilterStore((state) => state.regions);
  const statuses = useFilterStore((state) => state.statuses);
  const setFilter = useFilterStore((state) => state.setFilter);
  const resetFilters = useFilterStore((state) => state.resetFilters);

  const airlineOptions = Array.from(
    new Set(
      flights
        .map((flight) => flight.detail?.airlineIata || flight.callsign?.slice(0, 3)?.trim() || null)
        .filter((value): value is string => Boolean(value)),
    ),
  )
    .sort()
    .slice(0, 12);

  const aircraftTypeOptions = Array.from(
    new Set(
      flights
        .map((flight) => flight.detail?.aircraftType)
        .filter((value): value is string => Boolean(value)),
    ),
  )
    .sort()
    .slice(0, 10);

  return (
    <aside
      className={cn(
        'absolute left-4 top-20 z-40 w-80 rounded-3xl border border-white/10 bg-slate-950/85 p-4 shadow-glass backdrop-blur transition',
        filterPanelOpen ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0',
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Filters</div>
          <div className="text-xs text-slate-400">Refine the live traffic view.</div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:text-white"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => setFilterPanelOpen(false)}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 transition hover:text-white"
          >
            Hide
          </button>
        </div>
      </div>

      <AltitudeFilter
        range={altitudeRange}
        onChange={(altitudeRange) => setFilter({ altitudeRange })}
      />
      <RegionFilter selected={regions} onChange={(regions) => setFilter({ regions })} />
      <StatusFilter selected={statuses} onChange={(statuses) => setFilter({ statuses })} />
      <AirlineFilter
        airlines={airlineOptions}
        selected={airlines}
        onChange={(airlines) => setFilter({ airlines })}
      />

      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Aircraft Type
        </div>
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
          {aircraftTypeOptions.length === 0 && (
            <div className="text-xs text-slate-500">Aircraft types appear as detail data loads.</div>
          )}
          {aircraftTypeOptions.map((aircraftType) => {
            const active = aircraftTypes.includes(aircraftType);
            return (
              <button
                key={aircraftType}
                type="button"
                onClick={() =>
                  setFilter({ aircraftTypes: toggleValue(aircraftTypes, aircraftType) })
                }
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition',
                  active
                    ? 'border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-200'
                    : 'border-white/10 text-slate-300 hover:text-white',
                )}
              >
                {aircraftType}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
