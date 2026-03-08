import type { FlightStatus } from '../../types/flight';
import { STATUS_OPTIONS } from '../../utils/constants';
import { Toggle } from '../ui/Toggle';

type StatusFilterProps = {
  selected: FlightStatus[];
  onChange: (statuses: FlightStatus[]) => void;
};

function toggleValue(items: FlightStatus[], value: FlightStatus) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function StatusFilter({ selected, onChange }: StatusFilterProps) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</div>
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const value = option.value as FlightStatus;
          return (
            <Toggle key={value} active={selected.includes(value)} onClick={() => onChange(toggleValue(selected, value))}>
              {option.label}
            </Toggle>
          );
        })}
      </div>
    </section>
  );
}
