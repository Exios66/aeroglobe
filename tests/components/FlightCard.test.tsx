import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FlightCard } from '../../src/components/flight/FlightCard';
import { useFlightStore } from '../../src/store/flightStore';

describe('FlightCard', () => {
  beforeEach(() => {
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
});
