type FlightBadgeProps = {
  airline: string;
  flightNumber: string;
};

export function FlightBadge({ airline, flightNumber }: FlightBadgeProps) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-slate-200">
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/10 text-[10px] font-semibold text-cyan-200">
        {airline.slice(0, 2).toUpperCase()}
      </span>
      <span>{flightNumber}</span>
    </div>
  );
}
