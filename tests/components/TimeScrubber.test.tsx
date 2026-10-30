import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeScrubber } from '../../src/components/timeline/TimeScrubber';
import { useFlightStore, useUiStore } from '../../src/store';

afterEach(() => {
  cleanup();
  useUiStore.setState({
    timelineOpen: false,
    playbackSpeed: 60,
    playbackPlaying: false,
    playbackTime: null,
    dayHours: [],
    loadedHour: null,
    selectedHour: null,
    selectedDataDay: null,
  });
  useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
});

describe('TimeScrubber playback speed', () => {
  it('starts at 60× and keeps the chosen speed', () => {
    useUiStore.setState({ timelineOpen: true, playbackSpeed: 60 });
    render(<TimeScrubber />);
    const sixty = screen.getByRole('button', { name: '60×' });
    expect(sixty).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '300×' }));
    expect(useUiStore.getState().playbackSpeed).toBe(300);
    expect(screen.getByRole('button', { name: '300×' })).toHaveAttribute('aria-pressed', 'true');
    expect(sixty).toHaveAttribute('aria-pressed', 'false');
  });

  it('loads the hour chosen from the traffic bars', () => {
    useUiStore.setState({
      timelineOpen: true,
      selectedDataDay: '2026-10-12',
      loadedHour: 22,
      dayHours: Array.from({ length: 24 }, (_, hour) => hour === 0 || hour === 22 ? 10 : 0),
    });
    render(<TimeScrubber />);
    fireEvent.click(screen.getByRole('button', { name: '00:00 UTC, 10 aircraft' }));
    expect(useUiStore.getState().selectedHour).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: '22:00 UTC, 10 aircraft' }));
    expect(useUiStore.getState().playbackTime?.toISOString()).toBe('2026-10-12T22:00:00.000Z');
    expect(useUiStore.getState().selectedHour).toBe(0);
  });

  it('publishes its height so the flight card can sit above a wrapped timeline', () => {
    useUiStore.setState({ timelineOpen: true });
    const view = render(<TimeScrubber />);
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toMatch(/px$/);
    view.unmount();
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('');
  });
});
