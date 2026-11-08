import { useUiStore } from '../../store';

/**
 * Floating chip following the time-zone overlay hover: the zone name plus the wall-clock
 * time inside it, right now. Absent when nothing is hovered or the overlay is off.
 */
export function TzHoverChip() {
  const tzHover = useUiStore((state) => state.tzHover);
  const tzOverlayOpen = useUiStore((state) => state.tzOverlayOpen);
  if (!tzOverlayOpen || !tzHover) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute bottom-[calc(var(--timeline-height,12rem)+1.25rem)] left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/85 px-4 py-2 text-center text-xs shadow-glass backdrop-blur"
    >
      <span className="text-cyan-300">{tzHover.tzid}</span>
      <span className="ml-2 text-slate-200">{tzHover.local} local</span>
    </div>
  );
}
