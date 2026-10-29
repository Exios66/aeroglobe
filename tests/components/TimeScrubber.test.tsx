import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeScrubber } from '../../src/components/timeline/TimeScrubber';
import { useFlightStore, useUiStore } from '../../src/store';

afterEach(() => {
  cleanup();
  useUiStore.setState({ timelineOpen: false, playbackSpeed: 60, playbackPlaying: false, playbackTime: null });
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
});
