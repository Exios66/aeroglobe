import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FlightCard } from '../../src/components/flight/FlightCard';
import { useUiStore } from '../../src/store';
import { useFlightStore } from '../../src/store/flightStore';

afterEach(() => {
  cleanup();
  useUiStore.setState(useUiStore.getInitialState(), true);
  useFlightStore.setState(useFlightStore.getInitialState(), true);
});

describe('FlightCard', () => {
  beforeEach(() => {
    useUiStore.setState(useUiStore.getInitialState(), true);
    useFlightStore.setState({
      flights: new Map([
        [
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
            detail: {
              flightNumber: 'DL214',
              airline: 'Delta Air Lines',
              airlineIata: 'DL',
              originIata: 'JFK',
              originCity: 'New York',
              originCoordinates: [-73.7781, 40.6413],
              destinationIata: 'LHR',
              destinationCity: 'London',
              destinationCoordinates: [-0.4543, 51.47],
              departureTime: new Date().toISOString(),
              arrivalTime: new Date().toISOString(),
              status: 'active',
              aircraftType: 'Airbus A330-900',
              registration: 'N402DX',
              routeCoordinates: [
                [-73.7781, 40.6413],
                [-0.4543, 51.47],
              ],
            },
          },
        ],
      ]),
      selectedFlightId: 'abc123',
      lastUpdated: new Date(),
    });
  });

  it('renders selected flight detail and closes cleanly', async () => {
    const user = userEvent.setup();
    render(<FlightCard />);

    expect(screen.getByText(/Delta Air Lines/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(useFlightStore.getState().selectedFlightId).toBeNull();
  });

  it('clears the open timeline instead of a fixed offset', () => {
    useUiStore.setState({ timelineOpen: true });
    render(<FlightCard />);
    expect(screen.getByText(/Delta Air Lines/i).closest('section')?.className).toContain('var(--timeline-height,12rem)');
  });

  it('switches the vertical offset and height limit when the timeline opens and closes', () => {
    render(<FlightCard />);
    const section = screen.getByText(/Delta Air Lines/i).closest('section');
    expect(section).toHaveClass('bottom-4', 'max-h-[65vh]');

    act(() => useUiStore.getState().setTimelineOpen(true));
    expect(section).toHaveClass(
      'bottom-[calc(var(--timeline-height,12rem)+1.75rem)]',
      'max-h-[min(65vh,calc(100dvh-var(--timeline-height,12rem)-12rem))]',
    );
    expect(section).not.toHaveClass('bottom-4');
    expect(section).not.toHaveClass('max-h-[65vh]');

    act(() => useUiStore.getState().setTimelineOpen(false));
    expect(section).toHaveClass('bottom-4', 'max-h-[65vh]');
    expect(section?.className).not.toContain('--timeline-height');
  });
});
