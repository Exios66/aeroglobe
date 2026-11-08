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
  /** Origin airport ICAO, when known. */
  originIcao?: string;
  originCoordinates?: [number, number];
  /** IANA time-zone of the origin airport, when known. */
  originTz?: string;
  destinationIata: string;
  destinationCity: string;
  /** Destination airport ICAO, when known. */
  destinationIcao?: string;
  destinationCoordinates?: [number, number];
  /** IANA time-zone of the destination airport, when known. */
  destinationTz?: string;
  departureTime: string;
  arrivalTime: string;
  status: FlightStatus;
  aircraftType: string;
  registration: string;
  routeCoordinates: [number, number][];
}

export interface Flight extends AircraftState {
  detail?: FlightDetail;
  /** Recorded positions only; altitude is meters, matching the live aircraft state. */
  track?: FlightTrackPoint[];
}

export interface FlightTrackPoint {
  longitude: number;
  latitude: number;
  altitude: number;
  timestamp: number;
}

export interface FlightSearchResult {
  icao24: string;
  callsign: string | null;
  airline: string;
  flightNumber: string;
  route: string;
  status: FlightStatus;
}
