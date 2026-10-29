import { afterEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../src/store/uiStore';
import { DEFAULT_PLAYBACK_SPEED, PLAYBACK_SPEEDS } from '../../src/utils/playback';

afterEach(() => useUiStore.setState(useUiStore.getInitialState(), true));

describe('playback speed configuration', () => {
  it('offers the documented speeds and starts at 60 recorded seconds per second', () => {
    expect(PLAYBACK_SPEEDS).toEqual([1, 10, 60, 300]);
    expect(DEFAULT_PLAYBACK_SPEED).toBe(60);
    expect(useUiStore.getInitialState().playbackSpeed).toBe(60);
  });

  it.each([1, 10, 60, 300] as const)('sets %i× without changing other UI or playback state', (speed) => {
    useUiStore.setState({
      playbackSpeed: speed === 1 ? 300 : 1,
      playbackTime: new Date('2026-01-01T01:00:00Z'),
      playbackPlaying: true,
      timelineOpen: true,
      followFlight: true,
      selectedDataDay: '2026-01-01',
    });
    const before = useUiStore.getState();

    before.setPlaybackSpeed(speed);

    expect(useUiStore.getState()).toEqual({ ...before, playbackSpeed: speed });
  });
});
