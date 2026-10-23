import { beforeEach, describe, expect, it } from 'vitest';
import { useFilterStore } from '../../src/store/filterStore';
import { useFlightStore } from '../../src/store/flightStore';
import type { AircraftState, FlightDetail } from '../../src/types/flight';

const DETAIL: FlightDetail = {
  flightNumber: 'DL214', airline: 'Delta Air Lines', airlineIata: 'DL',
  originIata: 'JFK', originCity: 'New York', destinationIata: 'ATL', destinationCity: 'Atlanta',
  departureTime: '2026-10-23T10:00:00Z', arrivalTime: '2026-10-23T12:00:00Z',
  status: 'active', aircraftType: 'B738', registration: 'N12345', routeCoordinates: [],
};

const SAMPLE_STATES: AircraftState[] = [
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
  {
    icao24: 'def456',
    callsign: 'UAE5',
    originCountry: 'United Arab Emirates',
    longitude: 55.3,
    latitude: 25.2,
    baroAltitude: 3500,
    velocity: 120,
    trueTrack: 140,
    onGround: false,
    lastContact: 2,
  },
];

describe('flightStore', () => {
  beforeEach(() => {
    useFlightStore.setState({
      flights: new Map(),
      selectedFlightId: null,
      lastUpdated: null,
    });
    useFilterStore.getState().resetFilters();
  });

  it('loads live flights into a map', () => {
    useFlightStore.getState().setFlights(SAMPLE_STATES);
    expect(useFlightStore.getState().flights.size).toBe(2);
    expect(useFlightStore.getState().lastUpdated).toBeInstanceOf(Date);
  });

  it('keeps snapshot details while later position updates move the aircraft', () => {
    const snapshotTime = new Date('2026-10-23T10:30:00Z');
    useFlightStore.getState().setFlights([{ ...SAMPLE_STATES[0], detail: DETAIL }], snapshotTime);
    expect(useFlightStore.getState().lastUpdated).toEqual(snapshotTime);
    expect(useFlightStore.getState().flights.get('abc123')?.detail).toBe(DETAIL);
    useFlightStore.getState().setFlights([{ ...SAMPLE_STATES[0], longitude: -80, lastContact: 3 }]);
    expect(useFlightStore.getState().flights.get('abc123')).toMatchObject({ longitude: -80, lastContact: 3 });
    expect(useFlightStore.getState().flights.get('abc123')?.detail).toBe(DETAIL);
  });

  it('replaces cached details when an incoming flight provides newer details', () => {
    useFlightStore.getState().setFlights(SAMPLE_STATES);
    useFlightStore.getState().setFlightDetail('abc123', DETAIL);
    const replacement = { ...DETAIL, destinationIata: 'LAX', destinationCity: 'Los Angeles' };
    useFlightStore.getState().setFlights([{ ...SAMPLE_STATES[0], detail: replacement }]);
    expect(useFlightStore.getState().flights.get('abc123')?.detail).toBe(replacement);
  });

  it('accepts an unknown snapshot time without inventing a current update time', () => {
    useFlightStore.getState().setFlights([], null);
    expect(useFlightStore.getState().lastUpdated).toBeNull();
  });

  it('filters flights by airline prefix and altitude', () => {
    useFlightStore.getState().setFlights(SAMPLE_STATES);
    useFilterStore.getState().setFilter({
      airlines: ['DAL'],
      altitudeRange: [30000, 45000],
    });

    const filtered = useFilterStore.getState().filteredFlights(useFlightStore.getState().flights);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.icao24).toBe('abc123');
  });
});
