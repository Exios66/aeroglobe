import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FilterPanel } from '../../src/components/filters/FilterPanel';
import { useFilterStore } from '../../src/store/filterStore';
import { useFlightStore } from '../../src/store/flightStore';
import { useUiStore } from '../../src/store/uiStore';
import type { AircraftState } from '../../src/types/flight';

const fixtures: AircraftState[] = [
  {
    icao24: 'a1b2c3',
    callsign: 'UAL1',
    originCountry: 'United States',
    longitude: -73.7,
    latitude: 40.6,
    baroAltitude: 10668,
    velocity: 240,
    trueTrack: 82,
    onGround: false,
    lastContact: 1,
  },
  {
    icao24: 'd4e5f6',
    callsign: 'DAL2',
    originCountry: 'United States',
    longitude: -0.45,
    latitude: 51.47,
    baroAltitude: 9144,
    velocity: 230,
    trueTrack: 90,
    onGround: false,
    lastContact: 1,
  },
];

describe('FilterPanel', () => {
  afterEach(() => {
    cleanup();
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null, lastUpdated: null });
    useUiStore.setState({ filterPanelOpen: false });
    useFilterStore.getState().resetFilters();
  });

  it('renders with flights in the store without an update loop', () => {
    useFlightStore.getState().setFlights(fixtures);
    useUiStore.setState({ filterPanelOpen: true });

    expect(() => render(<FilterPanel />)).not.toThrow();

    expect(screen.getByRole('button', { name: 'UAL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'DAL' })).toBeTruthy();
  });

  it('refreshes airline options when a poll replaces the flights map', () => {
    useFlightStore.getState().setFlights([fixtures[0]]);
    render(<FilterPanel />);
    expect(screen.getByRole('button', { name: 'UAL' })).toBeInTheDocument();
    act(() => useFlightStore.getState().setFlights([fixtures[1]]));
    expect(screen.queryByRole('button', { name: 'UAL' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DAL' })).toBeInTheDocument();
    act(() => useFlightStore.getState().setFlights([]));
    expect(screen.queryByRole('button', { name: 'DAL' })).not.toBeInTheDocument();
  });
});
