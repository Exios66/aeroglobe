import type { FlightDetail } from '../../src/types/flight';
import { greatCirclePoints } from '../../src/utils/geo';
import { getMockFlightDetail } from '../data/mockFlights';

type DetailLookupInput = {
  icao24: string;
  callsign?: string | null;
};

type AviationStackFlight = {
  airline?: {
    name?: string | null;
    iata?: string | null;
  } | null;
  flight?: {
    number?: string | null;
    iata?: string | null;
  } | null;
  departure?: {
    airport?: string | null;
    iata?: string | null;
    scheduled?: string | null;
    timezone?: string | null;
  } | null;
  arrival?: {
    airport?: string | null;
    iata?: string | null;
    scheduled?: string | null;
    timezone?: string | null;
  } | null;
  flight_status?: string | null;
  aircraft?: {
    registration?: string | null;
    iata?: string | null;
  } | null;
};

type AviationStackResponse = {
  data?: AviationStackFlight[];
};

function normalizeStatus(value: string | null | undefined): FlightDetail['status'] {
  switch (value) {
    case 'scheduled':
    case 'active':
    case 'landed':
    case 'cancelled':
    case 'diverted':
      return value;
    default:
      return 'active';
  }
}

async function fetchFromAviationStack({
  icao24,
  callsign,
}: DetailLookupInput): Promise<FlightDetail | null> {
  const apiKey = process.env.AVIATIONSTACK_KEY;
  if (!apiKey || !callsign) {
    return null;
  }

  try {
    const url = new URL('https://api.aviationstack.com/v1/flights');
    url.searchParams.set('access_key', apiKey);
    url.searchParams.set('flight_iata', callsign.trim());

    const response = await fetch(url.toString());
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as AviationStackResponse;
    const first = payload.data?.[0];
    if (!first) {
      return null;
    }

    const originCoordinates: [number, number] = [0, 0];
    const destinationCoordinates: [number, number] = [0, 0];

    return {
      flightNumber: first.flight?.iata || first.flight?.number || callsign.trim(),
      airline: first.airline?.name || 'Unknown Airline',
      airlineIata: first.airline?.iata || callsign.trim().slice(0, 2).toUpperCase(),
      originIata: first.departure?.iata || 'TBD',
      originCity: first.departure?.airport || first.departure?.timezone || 'Unknown origin',
      originCoordinates,
      destinationIata: first.arrival?.iata || 'TBD',
      destinationCity: first.arrival?.airport || first.arrival?.timezone || 'Unknown destination',
      destinationCoordinates,
      departureTime: first.departure?.scheduled || new Date().toISOString(),
      arrivalTime: first.arrival?.scheduled || new Date().toISOString(),
      status: normalizeStatus(first.flight_status),
      aircraftType: first.aircraft?.iata || 'Unknown aircraft',
      registration: first.aircraft?.registration || icao24.toUpperCase(),
      routeCoordinates: greatCirclePoints(originCoordinates, destinationCoordinates, 32),
    };
  } catch {
    return null;
  }
}

export async function resolveFlightDetail(input: DetailLookupInput): Promise<FlightDetail | null> {
  const external = await fetchFromAviationStack(input);
  if (external) {
    return external;
  }

  return getMockFlightDetail(input.icao24);
}
