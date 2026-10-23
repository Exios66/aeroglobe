import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { FlightList } from '../../src/components/flight/FlightList';
import { useFilterStore } from '../../src/store/filterStore';
import { useFlightStore } from '../../src/store/flightStore';
import { useUiStore } from '../../src/store/uiStore';
import type { AircraftState } from '../../src/types/flight';

function aircraft(index: number): AircraftState {
  return {
    icao24: index.toString(16).padStart(6, '0'),
    callsign: index === 249 ? 'UNIQUEJET' : `UAL${index.toString().padStart(4, '0')}`,
    originCountry: 'United States',
    longitude: -100,
    latitude: 40,
    baroAltitude: 10_000 - index,
    velocity: 240,
    trueTrack: 90,
    onGround: false,
    lastContact: 1,
  };
}

describe('FlightList', () => {
  afterEach(() => {
    cleanup();
    useFlightStore.setState({ flights: new Map(), selectedFlightId: null, lastUpdated: null });
    useFilterStore.getState().resetFilters();
    useUiStore.setState({ sidebarOpen: true });
  });

  it('keeps rows bounded while paging through the full traffic set and selecting a later flight', async () => {
    const user = userEvent.setup();
    useFlightStore.getState().setFlights(Array.from({ length: 250 }, (_, index) => aircraft(index)));
    render(<FlightList />);

    expect(screen.getByText('250 aircraft')).toBeInTheDocument();
    expect(screen.getByText('UAL0000')).toBeInTheDocument();
    expect(screen.queryByText('UAL0100')).not.toBeInTheDocument();
    expect(document.querySelectorAll('aside button')).toHaveLength(103);
    expect(screen.getByLabelText('Previous flights')).toBeDisabled();

    await user.click(screen.getByLabelText('Next flights'));
    expect(screen.getByText('101–200 of 250')).toBeInTheDocument();
    expect(screen.queryByText('UAL0000')).not.toBeInTheDocument();
    await user.click(screen.getByText('UAL0100'));
    expect(useFlightStore.getState().selectedFlightId).toBe(aircraft(100).icao24);

    await user.click(screen.getByLabelText('Next flights'));
    expect(screen.getByText('201–250 of 250')).toBeInTheDocument();
    expect(document.querySelectorAll('aside button')).toHaveLength(53);
    expect(screen.getByLabelText('Next flights')).toBeDisabled();
  });

  it('searches flights beyond the current page and returns filters to their first page', async () => {
    const user = userEvent.setup();
    useFlightStore.getState().setFlights(Array.from({ length: 250 }, (_, index) => aircraft(index)));
    render(<FlightList />);
    await user.click(screen.getByLabelText('Next flights'));

    act(() => useFilterStore.getState().setFilter({ searchQuery: 'UNIQUEJET' }));
    expect(screen.getByText('1 aircraft')).toBeInTheDocument();
    expect(screen.getByText('UNIQUEJET')).toBeInTheDocument();
    expect(screen.queryByLabelText('Next flights')).not.toBeInTheDocument();

    act(() => useFilterStore.getState().setFilter({ searchQuery: 'UAL00' }));
    expect(screen.getByText('UAL0000')).toBeInTheDocument();
    expect(document.querySelectorAll('aside button').length).toBeLessThanOrEqual(103);

    act(() => useFilterStore.getState().resetFilters());
    expect(screen.getByText('1–100 of 250')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous flights')).toBeDisabled();
  });
});
