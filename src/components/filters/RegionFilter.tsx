import type { RegionCode } from '../../types/filters';
import { REGION_LABELS } from '../../utils/constants';
import { Toggle } from '../ui/Toggle';

type RegionFilterProps = {
  selected: RegionCode[];
  onChange: (regions: RegionCode[]) => void;
};

function toggleValue(items: RegionCode[], value: RegionCode) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export function RegionFilter({ selected, onChange }: RegionFilterProps) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Region</div>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(REGION_LABELS) as [RegionCode, string][]).map(([value, label]) => (
          <Toggle key={value} active={selected.includes(value)} onClick={() => onChange(toggleValue(selected, value))}>
            {label}
          </Toggle>
        ))}
      </div>
    </section>
  );
}
