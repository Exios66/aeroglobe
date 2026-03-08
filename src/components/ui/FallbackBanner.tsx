/**
 * Shown when the app is using historical airport departure CSVs as fallback
 * (e.g. when live OpenSky is unavailable). Uses all included airport data (ORD, LAS, etc.).
 */
type FallbackBannerProps = {
  source: string | null;
  flightCount: number;
};

export function FallbackBanner({ source, flightCount }: FallbackBannerProps) {
  if (source !== 'historical') return null;

  return (
    <div
      className="absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded-2xl border border-amber-400/30 bg-amber-950/90 px-4 py-3 shadow-glass backdrop-blur"
      role="status"
      aria-label="Fallback data source active"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-sm">
        <span className="font-semibold text-amber-200">
          Viewing historical departures (all included airport data: ORD, LAS, Frontier)
        </span>
        <span className="text-amber-300/90">
          {flightCount.toLocaleString()} flights from detailed statistics
        </span>
      </div>
      <p className="mt-1.5 text-center text-xs text-amber-200/70">
        Live OpenSky feed unavailable; showing CSV-based fallback visualization.
      </p>
    </div>
  );
}
