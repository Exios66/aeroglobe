import { describe, expect, it } from 'vitest';
import {
  flightDurationMinutes,
  flightsOfAirframe,
  hourOf,
} from '../../src/services/flightHistory';
import { seekToFlight } from '../../src/components/flight/AircraftHistoryPanel';
import type { FlightRecord } from '../../src/services/staticData';
import { useFlightStore } from '../../src/store/flightStore';
import { useUiStore } from '../../src/store/uiStore';

function record(overrides: Partial<FlightRecord>): FlightRecord {
  return {
    id: '2026-10-12/abc123/1',
    icao24: 'abc123',
    cs: null,
    r: null,
    ty: null,
    al: null,
    dep: { ap: 'KORD', t: 1760230000, conf: 'ground' },
    arr: { ap: 'KDEN', t: 1760238000, conf: 'inferred' },
    km: 1430,
    maxAltFt: 37000,
    hours: [3, 4, 5],
    ...overrides,
  };
}

describe('flightsOfAirframe', () => {
  it('keeps only this airframes flights sorted by departure and tolerates unknown airframes', () => {
    const records = [
      record({ id: '2026-10-12/abc123/2', dep: { ap: 'KDEN', t: 1760350000, conf: 'ground' }, arr: { ap: 'KORD', t: 1760360000, conf: 'inferred' } }),
      record({ id: '2026-10-12/xxx999/1', icao24: 'xxx999' }),
      record({ id: '2026-10-12/abc123/1' }),
      record({ id: '2026-10-12/abc123/3', icao24: 'abc123', dep: { ap: 'KSEA', t: 1760340000, conf: 'ground' }, arr: { ap: 'KORD', t: 1760346000, conf: 'inferred' } }),
    ];
    expect(flightsOfAirframe(records, 'abc123').map((entry) => entry.id)).toEqual([
      '2026-10-12/abc123/1',
      '2026-10-12/abc123/3',
      '2026-10-12/abc123/2',
    ]);
    expect(flightsOfAirframe(records, 'nome000')).toEqual([]);
  });
});

describe('hourOf / flightDurationMinutes', () => {
  it('derives the UTC hour block and flight duration', () => {
    expect(hourOf(1760230000)).toBe(0);
    expect(hourOf(1760280000)).toBe(14);
    expect(flightDurationMinutes(record({}))).toBe(133);
    expect(flightDurationMinutes(record({ dep: { ap: 'KORD', t: 100, conf: 'ground' }, arr: { ap: 'KDEN', t: 20, conf: 'inferred' } }))).toBe(0);
  });
});

describe('seekToFlight', () => {
  it('selects the airframe, opens the timeline, and seeks within the loaded hour', () => {
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
    useUiStore.setState({ timelineOpen: false, playbackPlaying: false, loadedHour: hourOf(1760230000), selectedHour: null });
    seekToFlight(record({}), useFlightStore.getState().selectFlight);
    expect(useFlightStore.getState().selectedFlightId).toBe('abc123');
    expect(useUiStore.getState().timelineOpen).toBe(true);
    expect(useUiStore.getState().playbackPlaying).toBe(true);
    expect(useUiStore.getState().playbackTime?.getTime()).toBe(1760230000 * 1000);
    expect(useUiStore.getState().selectedHour).toBeNull();
  });

  it('requests the other hour when the flight departs outside the loaded one', () => {
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
    useUiStore.setState({
      timelineOpen: false,
      playbackPlaying: false,
      loadedHour: 5,
      selectedHour: 5,
      playbackTime: null,
    });
    seekToFlight(record({ id: '2026-10-12/abc123/2', dep: { ap: 'KDEN', t: 1760350000, conf: 'ground' }, arr: { ap: 'KORD', t: 1760360000, conf: 'inferred' } }), useFlightStore.getState().selectFlight);
    expect(useFlightStore.getState().selectedFlightId).toBe('abc123');
    expect(useUiStore.getState().selectedHour).toBe(hourOf(1760350000));
    expect(useUiStore.getState().playbackPlaying).toBe(true);
  });
});
