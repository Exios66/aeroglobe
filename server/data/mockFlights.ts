import type { AircraftState, FlightDetail, FlightSearchResult, FlightStatus } from '../../src/types/flight';
import { greatCirclePoints } from '../../src/utils/geo';

type MockFlightSeed = {
  state: AircraftState;
  detail: Omit<FlightDetail, 'routeCoordinates'> & {
    originCoordinates: [number, number];
    destinationCoordinates: [number, number];
  };
};

const now = Date.now();

const MOCK_SEEDS: MockFlightSeed[] = [
  {
    state: {
      icao24: 'a1b2c3',
      callsign: 'DAL214',
      originCountry: 'United States',
      longitude: -73.7781,
      latitude: 40.6413,
      baroAltitude: 10120,
      velocity: 236,
      trueTrack: 61,
      onGround: false,
      lastContact: Math.floor(now / 1000),
    },
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
      departureTime: new Date(now - 2.1 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(now + 3.4 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      aircraftType: 'Airbus A330-900',
      registration: 'N402DX',
    },
  },
  {
    state: {
      icao24: 'd4e5f6',
      callsign: 'UAE5',
      originCountry: 'United Arab Emirates',
      longitude: 31.2357,
      latitude: 30.0444,
      baroAltitude: 11450,
      velocity: 248,
      trueTrack: 123,
      onGround: false,
      lastContact: Math.floor(now / 1000),
    },
    detail: {
      flightNumber: 'EK5',
      airline: 'Emirates',
      airlineIata: 'EK',
      originIata: 'DXB',
      originCity: 'Dubai',
      originCoordinates: [55.3644, 25.2528],
      destinationIata: 'LHR',
      destinationCity: 'London',
      destinationCoordinates: [-0.4543, 51.47],
      departureTime: new Date(now - 4.3 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(now + 1.7 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      aircraftType: 'Airbus A380-800',
      registration: 'A6-EUU',
    },
  },
  {
    state: {
      icao24: 'c7d8e9',
      callsign: 'QFA12',
      originCountry: 'Australia',
      longitude: 147.175,
      latitude: -33.8688,
      baroAltitude: 10970,
      velocity: 241,
      trueTrack: 79,
      onGround: false,
      lastContact: Math.floor(now / 1000),
    },
    detail: {
      flightNumber: 'QF12',
      airline: 'Qantas',
      airlineIata: 'QF',
      originIata: 'LAX',
      originCity: 'Los Angeles',
      originCoordinates: [-118.4085, 33.9416],
      destinationIata: 'SYD',
      destinationCity: 'Sydney',
      destinationCoordinates: [151.1772, -33.9399],
      departureTime: new Date(now - 8.8 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(now + 5.5 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      aircraftType: 'Boeing 787-9',
      registration: 'VH-ZNC',
    },
  },
  {
    state: {
      icao24: 'f1e2d3',
      callsign: 'AFR11',
      originCountry: 'France',
      longitude: 2.5479,
      latitude: 49.0097,
      baroAltitude: 0,
      velocity: 0,
      trueTrack: 215,
      onGround: true,
      lastContact: Math.floor(now / 1000),
    },
    detail: {
      flightNumber: 'AF11',
      airline: 'Air France',
      airlineIata: 'AF',
      originIata: 'CDG',
      originCity: 'Paris',
      originCoordinates: [2.5479, 49.0097],
      destinationIata: 'JFK',
      destinationCity: 'New York',
      destinationCoordinates: [-73.7781, 40.6413],
      departureTime: new Date(now + 45 * 60 * 1000).toISOString(),
      arrivalTime: new Date(now + 8.5 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      aircraftType: 'Boeing 777-300ER',
      registration: 'F-GSQM',
    },
  },
  {
    state: {
      icao24: '9abcde',
      callsign: 'SIA23',
      originCountry: 'Singapore',
      longitude: 96.1735,
      latitude: 16.8409,
      baroAltitude: 11850,
      velocity: 252,
      trueTrack: 204,
      onGround: false,
      lastContact: Math.floor(now / 1000),
    },
    detail: {
      flightNumber: 'SQ23',
      airline: 'Singapore Airlines',
      airlineIata: 'SQ',
      originIata: 'JFK',
      originCity: 'New York',
      originCoordinates: [-73.7781, 40.6413],
      destinationIata: 'SIN',
      destinationCity: 'Singapore',
      destinationCoordinates: [103.994, 1.3644],
      departureTime: new Date(now - 10.2 * 60 * 60 * 1000).toISOString(),
      arrivalTime: new Date(now + 7.8 * 60 * 60 * 1000).toISOString(),
      status: 'active',
      aircraftType: 'Airbus A350-900ULR',
      registration: '9V-SGA',
    },
  },
];

function getStatusFromState(state: AircraftState, fallback: FlightStatus): FlightStatus {
  if (state.onGround && fallback === 'active') {
    return 'landed';
  }

  return fallback;
}

export function getMockAircraftStates(): AircraftState[] {
  return MOCK_SEEDS.map(({ state }, index) => ({
    ...state,
    longitude: state.longitude + Math.sin((Date.now() / 60000 + index) * 0.35) * 0.9,
    latitude: state.latitude + Math.cos((Date.now() / 60000 + index) * 0.22) * 0.35,
    trueTrack: ((state.trueTrack ?? 0) + index * 7) % 360,
    lastContact: Math.floor(Date.now() / 1000),
  }));
}

export function getMockFlightDetail(icao24: string): FlightDetail | null {
  const seed = MOCK_SEEDS.find((entry) => entry.state.icao24 === icao24);
  if (!seed) {
    return null;
  }

  return {
    ...seed.detail,
    status: getStatusFromState(seed.state, seed.detail.status),
    routeCoordinates: greatCirclePoints(
      seed.detail.originCoordinates,
      seed.detail.destinationCoordinates,
      64,
    ),
  };
}

export function searchMockFlights(query: string): FlightSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return MOCK_SEEDS.flatMap(({ state, detail }) => {
    const haystack = [
      state.callsign ?? '',
      detail.airline,
      detail.flightNumber,
      detail.originIata,
      detail.originCity,
      detail.destinationIata,
      detail.destinationCity,
    ]
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(normalizedQuery)) {
      return [];
    }

    return [
      {
        icao24: state.icao24,
        callsign: state.callsign,
        airline: detail.airline,
        flightNumber: detail.flightNumber,
        route: `${detail.originIata} -> ${detail.destinationIata}`,
        status: detail.status,
      },
    ];
  });
}
