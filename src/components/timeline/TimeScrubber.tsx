import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../../store';
import { Button } from '../ui/Button';

const HOURS_24_MS = 24 * 60 * 60 * 1000;

function getMinTime() {
  return Date.now() - HOURS_24_MS;
}

export function TimeScrubber() {
  const timelineOpen = useUiStore((state) => state.timelineOpen);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const setPlaybackTime = useUiStore((state) => state.setPlaybackTime);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!timelineOpen || !isPlaying) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const current = useUiStore.getState().playbackTime;
      const next = Math.min((current?.getTime() ?? getMinTime()) + 5 * 60 * 1000, Date.now());
      if (next >= Date.now()) {
        useUiStore.getState().setPlaybackTime(null);
        setIsPlaying(false);
        return;
      }

      useUiStore.getState().setPlaybackTime(new Date(next));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isPlaying, timelineOpen]);

  const sliderValue = useMemo(() => playbackTime?.getTime() ?? Date.now(), [playbackTime]);

  if (!timelineOpen) {
    return null;
  }

  return (
    <section className="absolute inset-x-4 bottom-4 z-50 rounded-3xl border border-white/10 bg-slate-950/85 p-4 shadow-glass backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Timeline Playback</div>
          <div className="text-xs text-slate-400">
            {playbackTime ? playbackTime.toUTCString() : 'Live mode'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setIsPlaying((current) => !current)}>
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setPlaybackTime(null);
              setIsPlaying(false);
            }}
          >
            Live
          </Button>
        </div>
      </div>
      <input
        aria-label="Playback timeline"
        type="range"
        min={getMinTime()}
        max={Date.now()}
        step={5 * 60 * 1000}
        value={sliderValue}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Math.abs(Date.now() - next) < 60_000) {
            setPlaybackTime(null);
            return;
          }

          setPlaybackTime(new Date(next));
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
      />
    </section>
  );
}
