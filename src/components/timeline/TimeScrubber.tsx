import { useMemo } from 'react';
import { useFlightStore, useUiStore } from '../../store';
import { PLAYBACK_SPEEDS, playbackBounds } from '../../utils/playback';
import { Button } from '../ui/Button';

export function TimeScrubber() {
  const timelineOpen = useUiStore((state) => state.timelineOpen);
  const playbackTime = useUiStore((state) => state.playbackTime);
  const setPlaybackTime = useUiStore((state) => state.setPlaybackTime);
  const followFlight = useUiStore((state) => state.followFlight);
  const setFollowFlight = useUiStore((state) => state.setFollowFlight);
  const flights = useFlightStore((state) => state.flights);
  const selectedId = useFlightStore((state) => state.selectedFlightId);
  const isPlaying = useUiStore((state) => state.playbackPlaying);
  const setIsPlaying = useUiStore((state) => state.setPlaybackPlaying);
  const playbackSpeed = useUiStore((state) => state.playbackSpeed);
  const setPlaybackSpeed = useUiStore((state) => state.setPlaybackSpeed);
  const days = useUiStore((state) => state.dataDays);
  const selectedDay = useUiStore((state) => state.selectedDataDay);
  const setSelectedDay = useUiStore((state) => state.setSelectedDataDay);
  const bounds = useMemo(() => {
    const selected = selectedId ? flights.get(selectedId) : undefined;
    return playbackBounds(selected?.track && selected.track.length > 1 ? [selected] : flights.values());
  }, [flights, selectedId]);
  const min = bounds?.[0] ?? 0;
  const max = bounds?.[1] ?? 0;
  const value = Math.max(min, Math.min(max, playbackTime?.getTime() ?? max));

  if (!timelineOpen) return null;
  return (
    <section className="absolute inset-x-4 bottom-4 z-50 rounded-3xl border border-cyan-400/20 bg-slate-950/95 p-4 shadow-glass backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Recorded flight playback</div>
          {days.length > 1 && <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            Dataset day
            <select aria-label="Dataset day" value={selectedDay ?? days[0]?.date ?? ''}
              onChange={(event) => setSelectedDay(event.target.value)}
              className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1 text-white">
              {days.map((day) => <option key={day.date} value={day.date}>
                {day.date} · {day.source === 'fixtures' ? 'Sample tracks' : day.source === 'opensky' ? 'OpenSky snapshot' : day.source}
              </option>)}
            </select>
          </label>}
          <div className="text-xs text-slate-400">
            {bounds ? `${new Date(value).toUTCString()} · ${selectedId ? 'Selected flight' : 'All recorded tracks'}` : 'No multi-point tracks in this snapshot'}
          </div>
          <div className="mt-1 text-xs text-cyan-300/80">Cyan lines show recorded tracks. Click a plane or line to explore.</div>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
            {PLAYBACK_SPEEDS.map((speed) => (
              <Button
                key={speed}
                variant={playbackSpeed === speed ? 'primary' : 'secondary'}
                aria-pressed={playbackSpeed === speed}
                onClick={() => setPlaybackSpeed(speed)}
              >
                {speed}×
              </Button>
            ))}
          </div>
          <Button variant="secondary" disabled={!bounds} onClick={() => {
            if (!isPlaying && (!playbackTime || value >= max)) setPlaybackTime(new Date(min));
            setIsPlaying(!isPlaying);
          }}>{isPlaying ? 'Pause' : 'Play history'}</Button>
          <Button variant="secondary" disabled={!selectedId} onClick={() => setFollowFlight(!followFlight)}>
            {followFlight ? 'Stop following' : 'Follow plane'}
          </Button>
          <Button variant="secondary" onClick={() => { setPlaybackTime(null); setIsPlaying(false); }}>Latest</Button>
        </div>
      </div>
      <input aria-label="Playback timeline" type="range" min={min} max={max || 1}
        step={Math.max(1, Math.round((max - min) / 1000))} value={value} disabled={!bounds}
        onChange={(event) => { setIsPlaying(false); setPlaybackTime(new Date(Number(event.currentTarget.value))); }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400 disabled:cursor-not-allowed" />
      {bounds && <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{new Date(min).toISOString().slice(11, 19)} UTC</span>
        <span>{new Date(max).toISOString().slice(11, 19)} UTC</span>
      </div>}
    </section>
  );
}
