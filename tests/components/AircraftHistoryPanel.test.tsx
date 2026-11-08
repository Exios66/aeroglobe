import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AircraftHistoryPanel } from '../../src/components/flight/AircraftHistoryPanel';
import type { FlightRecord } from '../../src/services/staticData';
import { useCatalogStore } from '../../src/store/catalogStore';
import { useFlightStore } from '../../src/store/flightStore';
import { useUiStore } from '../../src/store/uiStore';

function record(id: string, icao24: string, depT: number, dep: string, arr: string): FlightRecord {
  return {
    id,
    icao24,
    cs: 'UAL1',
    r: null,
    ty: null,
    al: null,
    dep: { ap: dep, t: depT, conf: 'ground' },
    arr: { ap: arr, t: depT + 300, conf: 'inferred' },
    km: 500,
    maxAltFt: 35000,
    hours: [depT],
  };
}

describe('AircraftHistoryPanel', () => {
  it('lists the airframes indexed flights and hides itself when there are none', () => {
    const history = [
      record('2026-10-12/abc123/1', 'abc123', 1760230000, 'KORD', 'KDEN'),
      record('2026-10-12/abc123/3', 'abc123', 1760340000, 'KSEA', 'KORD'),
    ];
    useCatalogStore.setState({ records: history, airports: new Map(), airlines: new Map(), dayDate: '2026-10-12' });
    const first = render(<AircraftHistoryPanel icao24="abc123" />);
    expect(screen.getByRole('region', { name: 'Aircraft history' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3); // two rows + show/hide
    first.unmount();
    useCatalogStore.setState({ records: [] });
    render(<AircraftHistoryPanel icao24="abc123" />);
    expect(screen.queryByRole('region', { name: 'Aircraft history' })).toBeNull();
  });

  it('seeks into the departure hour of the chosen flight', async () => {
    const user = userEvent.setup();
    const target = record('2026-10-12/abc123/3', 'abc123', 1760230000, 'KORD', 'KDEN');
    useCatalogStore.setState({ records: [target], airports: new Map(), airlines: new Map(), dayDate: '2026-10-12' });
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null });
    useUiStore.setState({ timelineOpen: false, loadedHour: 0, selectedHour: null, playbackPlaying: false });
    render(<AircraftHistoryPanel icao24="abc123" />);
    await user.click(screen.getByRole('button', { name: /KORD → KDEN/ }));
    expect(useFlightStore.getState().selectedFlightId).toBe('abc123');
    expect(useUiStore.getState().timelineOpen).toBe(true);
    expect(useUiStore.getState().playbackTime?.getTime()).toBe(1760230000 * 1000);
  });

  it('marks the row whose flight window contains the loaded track', () => {
    const other = record('2026-10-12/abc123/1', 'abc123', 1760230000, 'KORD', 'KDEN');
    const loaded = record('2026-10-12/abc123/3', 'abc123', 1760340000, 'KSEA', 'KORD');
    useCatalogStore.setState({ records: [other, loaded], airports: new Map(), airlines: new Map(), dayDate: '2026-10-12' });
    useFlightStore.setState({
      flights: new Map([['abc123', { icao24: 'abc123', callsign: null, originCountry: '', longitude: 0, latitude: 0, baroAltitude: null, velocity: null, trueTrack: null, onGround: false, lastContact: 1760340100, track: [{ longitude: 0, latitude: 0, altitude: 0, timestamp: 1760340100 }] }]]),
    });
    render(<AircraftHistoryPanel icao24="abc123" />);
    const rows = within(screen.getByRole('region', { name: 'Aircraft history' })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const activeClass = (row: HTMLElement) => /(^| )bg-white\/5( |$)/.test(within(row).getByRole('button').className);
    expect(activeClass(rows[1])).toBe(true);
    expect(activeClass(rows[0])).toBe(false);
  });
});
