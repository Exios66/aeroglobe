import { Button } from '../ui/Button';
import { Toggle } from '../ui/Toggle';

type AirlineFilterProps = {
  airlines: string[];
  selected: string[];
  onChange: (airlines: string[]) => void;
};

function toggleValue(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function AirlineFilter({ airlines, selected, onChange }: AirlineFilterProps) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Airline</div>
        <div className="flex gap-2">
          <Button variant="ghost" className="px-0 py-0" onClick={() => onChange(airlines)}>
            Select All
          </Button>
          <Button variant="ghost" className="px-0 py-0" onClick={() => onChange([])}>
            Clear
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {airlines.map((airline) => (
          <Toggle key={airline} active={selected.includes(airline)} onClick={() => onChange(toggleValue(selected, airline))}>
            {airline}
          </Toggle>
        ))}
      </div>
    </section>
  );
}
