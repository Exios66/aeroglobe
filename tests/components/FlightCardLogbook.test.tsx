import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMemoryLogbookStorage } from '../../src/logbook/db';
import { setLogbookStorage } from '../../src/logbook/logbookStore';
import { useCatalogStore } from '../../src/store/catalogStore';
import { useUiStore, useFlightStore } from '../../src/store';
import { FlightCard } from '../../src/components/flight/FlightCard';
import type { AirportRow } from '../../src/services/staticData';

const detail = {
  flightNumber: 'UAL123',
  airline: 'United Airlines',
  airlineIata: 'UA',
  originIata: 'ORD',
  originCity: 'Chicago',
  originIcao: 'KORD',
  destinationIata: 'DEN',
  destinationCity: 'Denver',
  destinationIcao: 'KDEN',
  departureTime: '2026-10-12T03:10:00Z',
  arrivalTime: '2026-10-12T05:20:00Z',
  status: 'active' as const,
  aircraftType: 'B738',
  registration: 'N12345',
  routeCoordinates: [
    [-87.9, 41.98],
    [-104.67, 39.86],
  ] as [number, number][],
};

function seedSelectedFlight(depIcao: string, arrIcao: string): void {
  useFlightStore.setState({
    flights: new Map([[
      'f00002',
      {
        icao24: 'f00002',
        callsign: 'DAL456',
        originCountry: 'United States',
        longitude: -104.67,
        latitude: 39.86,
        baroAltitude: 9000,
        velocity: 200,
        trueTrack: 250,
        onGround: false,
        lastContact: 1,
        detail: { ...detail, originIcao: depIcao, destinationIcao: arrIcao },
      },
    ]]),
    selectedFlightId: 'f00002',
  });
}

describe('FlightCard Add to logbook', () => {
  it('logs the flight with airport ICAOs when both endpoints are known', async () => {
    setLogbookStorage(createMemoryLogbookStorage());
    useCatalogStore.setState({ records: [], airports: new Map<string, AirportRow>(), airlines: new Map(), dayDate: null });
    seedSelectedFlight('KORD', 'KDEN');
    const user = userEvent.setup();
    render(<FlightCard />);
    useUiStore.setState({ playbackTime: null });

    await user.click(screen.getByRole('button', { name: /add to logbook/i }));
    expect(screen.getByRole('status')).toHaveTextContent(/Logged to your personal logbook/i);

    const { useLogbookStore } = await import('../../src/logbook/logbookStore');
    const [entry] = useLogbookStore.getState().entries;
    expect(entry.depIcao).toBe('KORD');
    expect(entry.arrIcao).toBe('KDEN');
    // The spec documents the entry date as the viewer's LOCAL calendar day, not the UTC day.
    const departure = new Date('2026-10-12T03:10:00Z');
    const expectedDay = `${departure.getFullYear()}-${String(departure.getMonth() + 1).padStart(2, '0')}-${String(
      departure.getDate(),
    ).padStart(2, '0')}`;
    expect(entry.date).toBe(expectedDay);
  });

  it('stays disabled when a snapshot has no resolved route', () => {
    setLogbookStorage(createMemoryLogbookStorage());
    useFlightStore.setState({
      flights: new Map([[
        'f00008',
        {
          icao24: 'f00008',
          callsign: 'UAL2468',
          originCountry: 'United States',
          longitude: -118.4,
          latitude: 33.94,
          baroAltitude: 11000,
          velocity: 220,
          trueTrack: 90,
          onGround: false,
          lastContact: 1,
        },
      ]]),
      selectedFlightId: 'f00008',
    });
    render(<FlightCard />);
    useUiStore.setState({ playbackTime: null });
    expect(screen.getByRole('button', { name: /add to logbook/i })).toBeDisabled();
  });
});
