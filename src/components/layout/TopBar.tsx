import { useUiStore } from '../../store';
import { formatRelativeTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

const SOURCE_LABELS: Record<string, string> = {
  opensky: 'Live · OpenSky',
  snapshot: 'OpenSky snapshot',
  mock: 'Sample data',
  fixtures: 'Sample data',
  adsblol: 'Historical · adsb.lol',
  static: 'Static preview',
};

type TopBarProps = {
  liveCount: number;
  lastUpdated: Date | null;
  source: string | null;
};

function isNarrowViewport(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(max-width: 767px)').matches;
}

/** Displays traffic count, update age, and a source label, with controls for shared panel visibility and globe skin. */
export function TopBar({ liveCount, lastUpdated, source }: TopBarProps) {
  const globeSkin = useUiStore((state) => state.globeSkin);
  const setGlobeSkin = useUiStore((state) => state.setGlobeSkin);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const filterPanelOpen = useUiStore((state) => state.filterPanelOpen);
  const setFilterPanelOpen = useUiStore((state) => state.setFilterPanelOpen);
  const timelineOpen = useUiStore((state) => state.timelineOpen);
  const setTimelineOpen = useUiStore((state) => state.setTimelineOpen);

  return (
    <header className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-3xl border border-white/10 bg-slate-950/70 px-3 py-2 shadow-glass backdrop-blur md:inset-x-4 md:top-4 md:w-auto md:max-w-none md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4 md:px-5 md:py-4">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-[0.35em] text-cyan-300">AeroGlobe</div>
        <div className="truncate text-base font-semibold text-white md:text-lg">Live global flight operations</div>
      </div>

      <div className="hidden items-center gap-3 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 md:flex">
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
        <span>{liveCount.toLocaleString()} tracked</span>
        <span className="text-slate-500">|</span>
        <span>{formatRelativeTime(lastUpdated)}</span>
        <span className="text-slate-500">|</span>
        <span className="capitalize text-slate-400">
          {(source && SOURCE_LABELS[source]) || 'warming up'}
        </span>
      </div>

      <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto md:w-auto">
        <Button className="shrink-0" onClick={() => {
          const next = !filterPanelOpen;
          setFilterPanelOpen(next);
          if (next && isNarrowViewport()) setSidebarOpen(false);
        }}>Filters</Button>
        <Button className="shrink-0" onClick={() => {
          const next = !sidebarOpen;
          setSidebarOpen(next);
          if (next && isNarrowViewport()) setFilterPanelOpen(false);
        }}>Flights</Button>
        <Tooltip text="Toggle historical playback controls">
          <Button className="shrink-0" onClick={() => setTimelineOpen(!timelineOpen)}>
            {timelineOpen ? 'Hide Timeline' : 'Timeline'}
          </Button>
        </Tooltip>
        <Button className="shrink-0" onClick={() => setGlobeSkin(globeSkin === 'dark' ? 'light' : 'dark')}>
          {globeSkin === 'dark' ? 'Light' : 'Dark'} skin
        </Button>
        <a
          href="https://github.com/Exios66/aeroglobe"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:text-white"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
