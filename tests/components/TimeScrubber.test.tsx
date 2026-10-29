import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeScrubber } from '../../src/components/timeline/TimeScrubber';
import { useFlightStore, useUiStore } from '../../src/store';
import type { Flight } from '../../src/types/flight';

const startMs = 1_700_000_000_000;
const endMs = startMs + 300_000;
const flight: Flight = {
  icao24: 'abc123', callsign: 'TEST1', originCountry: 'US',
  longitude: 10, latitude: 20, baroAltitude: 1000,
  velocity: 200, trueTrack: 90, onGround: false, lastContact: startMs / 1000,
  track: [
    { longitude: 10, latitude: 20, altitude: 1000, timestamp: startMs / 1000 },
    { longitude: 11, latitude: 21, altitude: 1100, timestamp: endMs / 1000 },
  ],
};

beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  useFlightStore.setState(useFlightStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  useUiStore.setState(useUiStore.getInitialState(), true);
  useFlightStore.setState(useFlightStore.getInitialState(), true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it.each([1, 10, 60, 300] as const)('selects only %i× without interrupting playback or seeking', (speed) => {
    const playbackTime = new Date(startMs + 100_000);
    useFlightStore.getState().setFlights([flight]);
    useUiStore.setState({ timelineOpen: true, playbackTime, playbackPlaying: true });
    render(<TimeScrubber />);
    const group = screen.getByRole('group', { name: 'Playback speed' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent))
      .toEqual(['1×', '10×', '60×', '300×']);

    fireEvent.click(within(group).getByRole('button', { name: `${speed}×` }));

    expect(useUiStore.getState()).toMatchObject({ playbackSpeed: speed, playbackPlaying: true, playbackTime });
    expect(within(group).getAllByRole('button', { pressed: true }))
      .toEqual([within(group).getByRole('button', { name: `${speed}×` })]);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it('keeps the chosen speed through pause, seek, latest, and replay', () => {
    useFlightStore.getState().setFlights([flight]);
    useUiStore.setState({ timelineOpen: true });
    render(<TimeScrubber />);
    fireEvent.click(screen.getByRole('button', { name: '10×' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play history' }));
    expect(useUiStore.getState()).toMatchObject({ playbackPlaying: true, playbackTime: new Date(startMs), playbackSpeed: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(useUiStore.getState()).toMatchObject({ playbackPlaying: false, playbackSpeed: 10 });
    fireEvent.change(screen.getByRole('slider', { name: 'Playback timeline' }), { target: { value: startMs + 120_000 } });
    fireEvent.click(screen.getByRole('button', { name: 'Play history' }));
    expect(useUiStore.getState()).toMatchObject({ playbackPlaying: true, playbackTime: new Date(startMs + 120_000), playbackSpeed: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Latest' }));
    expect(useUiStore.getState()).toMatchObject({ playbackPlaying: false, playbackTime: null, playbackSpeed: 10 });
    fireEvent.click(screen.getByRole('button', { name: 'Play history' }));
    expect(useUiStore.getState()).toMatchObject({ playbackPlaying: true, playbackTime: new Date(startMs), playbackSpeed: 10 });
    expect(screen.getByRole('button', { name: '10×' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('allows choosing a speed before recorded tracks arrive', () => {
    useUiStore.setState({ timelineOpen: true });
    render(<TimeScrubber />);
    expect(screen.getByRole('button', { name: 'Play history' })).toBeDisabled();
    expect(screen.getByRole('slider')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '1×' }));
    expect(useUiStore.getState()).toMatchObject({ playbackSpeed: 1, playbackPlaying: false, playbackTime: null });

    act(() => useFlightStore.getState().setFlights([flight]));
    expect(screen.getByRole('button', { name: 'Play history' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TimeScrubber height measurement', () => {
  it('measures on opening and resize, disconnects on closing, and measures again on reopening', () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let resize = () => {};
    const ResizeObserverMock = vi.fn(function (callback: () => void) {
      resize = callback;
      return { observe, disconnect };
    });
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 400, 184));
    const { container, unmount } = render(<TimeScrubber />);
    expect(container).toBeEmptyDOMElement();
    expect(ResizeObserverMock).not.toHaveBeenCalled();

    act(() => useUiStore.getState().setTimelineOpen(true));
    expect(observe).toHaveBeenCalledExactlyOnceWith(container.querySelector('section'));
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('184px');
    measure.mockReturnValue(new DOMRect(0, 0, 400, 256));
    act(() => resize());
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('256px');

    act(() => useUiStore.getState().setTimelineOpen(false));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('');
    act(() => useUiStore.getState().setTimelineOpen(true));
    expect(ResizeObserverMock).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenLastCalledWith(container.querySelector('section'));
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('256px');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('');
  });

  it.each(['close', 'unmount'])('publishes and removes the height without ResizeObserver on %s', (cleanupMethod) => {
    vi.stubGlobal('ResizeObserver', undefined);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 192));
    useUiStore.setState({ timelineOpen: true });
    const { unmount } = render(<TimeScrubber />);
    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('192px');

    if (cleanupMethod === 'close') act(() => useUiStore.getState().setTimelineOpen(false));
    else unmount();

    expect(document.documentElement.style.getPropertyValue('--timeline-height')).toBe('');
  });
});
