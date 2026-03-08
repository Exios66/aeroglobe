import { Slider } from '../ui/Slider';

type AltitudeFilterProps = {
  range: [number, number];
  onChange: (range: [number, number]) => void;
};

function formatFlightLevel(value: number) {
  return `FL${Math.round(value / 100)}`;
}

export function AltitudeFilter({ range, onChange }: AltitudeFilterProps) {
  return (
    <section className="mb-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Altitude</div>
      <div className="mb-2 flex justify-between text-xs text-slate-300">
        <span>{range[0].toLocaleString()} ft</span>
        <span>{range[1].toLocaleString()} ft</span>
      </div>
      <div className="mb-3 flex justify-between text-[10px] uppercase tracking-[0.2em] text-slate-500">
        <span>{formatFlightLevel(range[0])}</span>
        <span>{formatFlightLevel(range[1])}</span>
      </div>
      <Slider
        aria-label="Minimum altitude"
        min={0}
        max={45000}
        step={1000}
        value={range[0]}
        onChange={(event) => {
          const nextMin = Number(event.currentTarget.value);
          onChange([Math.min(nextMin, range[1]), range[1]]);
        }}
        className="mb-2"
      />
      <Slider
        aria-label="Maximum altitude"
        min={0}
        max={45000}
        step={1000}
        value={range[1]}
        onChange={(event) => {
          const nextMax = Number(event.currentTarget.value);
          onChange([range[0], Math.max(range[0], nextMax)]);
        }}
      />
    </section>
  );
}
