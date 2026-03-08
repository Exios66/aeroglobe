import { beforeEach, describe, expect, it } from 'vitest';
import { useFilterStore } from '../../src/store/filterStore';
import { useFlightStore } from '../../src/store/flightStore';
import type { AircraftState } from '../../src/types/flight';

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
