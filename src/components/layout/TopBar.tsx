import { useUiStore } from '../../store';
import { formatRelativeTime } from '../../utils/format';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

type TopBarProps = {
  liveCount: number;
  lastUpdated: Date | null;
  source: string | null;
};

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
    <header className="absolute inset-x-4 top-4 z-50 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-slate-950/70 px-5 py-4 shadow-glass backdrop-blur">
      <div>
        <div className="text-xs uppercase tracking-[0.35em] text-cyan-300">AeroGlobe</div>
        <div className="text-lg font-semibold text-white">Live global flight operations</div>
      </div>

      <div className="hidden items-center gap-3 rounded-full border border-white/10 px-4 py-2 text-sm text-slate-200 md:flex">
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
        <span>{liveCount.toLocaleString()} tracked</span>
        <span className="text-slate-500">|</span>
        <span>{formatRelativeTime(lastUpdated)}</span>
        <span className="text-slate-500">|</span>
        <span className="capitalize text-slate-400">{source || 'warming up'}</span>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={() => setFilterPanelOpen(!filterPanelOpen)}>Filters</Button>
        <Button onClick={() => setSidebarOpen(!sidebarOpen)}>Flights</Button>
        <Tooltip text="Toggle historical playback controls">
          <Button onClick={() => setTimelineOpen(!timelineOpen)}>
            {timelineOpen ? 'Hide Timeline' : 'Timeline'}
          </Button>
        </Tooltip>
        <Button onClick={() => setGlobeSkin(globeSkin === 'dark' ? 'light' : 'dark')}>
          {globeSkin === 'dark' ? 'Light' : 'Dark'} skin
        </Button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 transition hover:text-white"
        >
          GitHub
        </a>
      </div>
    </header>
  );
}
