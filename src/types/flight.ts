export type FlightStatus = 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted';

export interface AircraftState {
  icao24: string;
  callsign: string | null;
  originCountry: string;
  longitude: number;
  latitude: number;
  baroAltitude: number | null;
  velocity: number | null;
  trueTrack: number | null;
  onGround: boolean;
  lastContact: number;
}

export interface FlightDetail {
  flightNumber: string;
  airline: string;
  airlineIata: string;
  originIata: string;
  originCity: string;
  originCoordinates?: [number, number];
  destinationIata: string;
  destinationCity: string;
  destinationCoordinates?: [number, number];
  departureTime: string;
  arrivalTime: string;
  status: FlightStatus;
  aircraftType: string;
  registration: string;
  routeCoordinates: [number, number][];
}

export interface Flight extends AircraftState {
  detail?: FlightDetail;
}

export interface FlightSearchResult {
  icao24: string;
  callsign: string | null;
  airline: string;
  flightNumber: string;
  route: string;
  status: FlightStatus;
}
