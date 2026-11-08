import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useFlightStore } from '../../src/store/flightStore';
import { FlightCard } from '../../src/components/flight/FlightCard';
import { useUiStore } from '../../src/store';

function seedFlight(): void {
  useFlightStore.setState({
    flights: new Map([[
      'abc123',
      {
        icao24: 'abc123',
        callsign: 'DAL214',
        originCountry: 'United States',
        longitude: -73.7,
        latitude: 40.6,
        baroAltitude: 10668,
        velocity: 240,
        trueTrack: 82,
        onGround: false,
        lastContact: 1,
      },
    ]]),
    selectedFlightId: 'abc123',
  });
}

describe('FlightCard accessibility', () => {
  it('is an escaped non-modal dialog labelled by the flight', async () => {
    seedFlight();
    const user = userEvent.setup();
    render(<FlightCard />);
    useUiStore.setState({ playbackTime: null });

    const dialog = screen.getByRole('dialog', { name: /Flight.DAL214/i });
    expect(dialog).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(useFlightStore.getState().selectedFlightId).toBeNull();
  });

  it('moves focus to the close button when a plane is picked', () => {
    seedFlight();
    render(<FlightCard />);
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus();
  });
});
