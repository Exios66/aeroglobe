import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { AircraftState, FlightDetail } from '../../../src/types/flight';
import { greatCirclePoints } from '../../../src/utils/geo';
import { getDestinationCoords } from './airportCoords';

export type DepartureRow = {
  carrierCode: string;
  date: string;
  flightNumber: string;
  tailNumber: string;
  destinationIata: string;
  scheduledDep: string;
  actualDep: string;
  scheduledElapsedMin: number;
  actualElapsedMin: number;
  departureDelayMin: number;
  wheelsOff: string;
  taxiOutMin: number;
  delayCarrier: number;
  delayWeather: number;
  delayNAS: number;
  delaySecurity: number;
  delayLateAircraft: number;
};

export type OriginConfig = {
  coords: [number, number];
  iata: string;
  city: string;
};

export type AirlineConfig = {
  iata: string;
  name: string;
  callsignPrefix: string;
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      result.push(current.trim());
      current = '';
    } else current += c;
  }
  result.push(current.trim());
  return result;
}

export function parseDeparturesCsv(csvPath: string): Promise<DepartureRow[]> {
  return new Promise((resolve, reject) => {
    const rows: DepartureRow[] = [];
    const headerIndices: Record<string, number> = {};
    let headerDone = false;

    const rl = createInterface({
      input: createReadStream(csvPath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      const cells = parseCsvLine(line);
      if (!headerDone && cells.some((c) => c.includes('Carrier Code'))) {
        cells.forEach((c, i) => {
          headerIndices[c.replace(/^"|"$/g, '').trim()] = i;
        });
        headerDone = true;
        return;
      }
      if (!headerDone) return;
      const get = (key: string) => (cells[headerIndices[key]] ?? '').replace(/^"|"$/g, '').trim();
      const num = (key: string) => {
        const n = parseInt(get(key), 10);
        return Number.isFinite(n) ? n : 0;
      };
      rows.push({
        carrierCode: get('Carrier Code'),
        date: get('Date (MM/DD/YYYY)'),
        flightNumber: get('Flight Number'),
        tailNumber: get('Tail Number'),
        destinationIata: get('Destination Airport'),
        scheduledDep: get('Scheduled departure time'),
        actualDep: get('Actual departure time'),
        scheduledElapsedMin: num('Scheduled elapsed time (Minutes)'),
        actualElapsedMin: num('Actual elapsed time (Minutes)'),
        departureDelayMin: num('Departure delay (Minutes)'),
        wheelsOff: get('Wheels-off time'),
        taxiOutMin: num('Taxi-Out time (Minutes)'),
        delayCarrier: num('Delay Carrier (Minutes)'),
        delayWeather: num('Delay Weather (Minutes)'),
        delayNAS: num('Delay National Aviation System (Minutes)'),
        delaySecurity: num('Delay Security (Minutes)'),
        delayLateAircraft: num('Delay Late Aircraft Arrival (Minutes)'),
      });
    });

    rl.on('close', () => resolve(rows));
    rl.on('error', reject);
  });
}

/** Unique icao24 per airport dataset: prefix (2 hex digits, e.g. "01") + 4 hex from tail+index = 6 hex. */
export function rowToIcao24(prefixHex2: string, tail: string, index: number): string {
  const clean = tail.replace(/\W/g, '').toUpperCase().slice(0, 4) || 'xx';
  const hex = Buffer.from(clean.padEnd(4, '0').slice(0, 4)).toString('hex').slice(0, 4);
  const suffix = (hex + index.toString(16)).slice(-4);
  return (prefixHex2 + suffix).slice(0, 6).toLowerCase();
}

function interpolate(
  origin: [number, number],
  dest: [number, number],
  fraction: number,
): [number, number] {
  const points = greatCirclePoints(origin, dest, 64);
  const index = Math.min(Math.floor(fraction * (points.length - 1)), points.length - 2);
  return points[index];
}

export function rowToState(
  row: DepartureRow,
  index: number,
  origin: OriginConfig,
  airline: AirlineConfig,
  icaoPrefixHex2: string,
): AircraftState | null {
  const destCoords = getDestinationCoords(row.destinationIata);
  if (!destCoords) return null;
  const elapsedMin = row.actualElapsedMin > 0 ? row.actualElapsedMin : row.scheduledElapsedMin;
  const totalMin = Math.max(elapsedMin, 60);
  const fraction = Math.min(0.95, (elapsedMin / totalMin) * 0.7 + (index % 10) * 0.02);
  const [longitude, latitude] = interpolate(origin.coords, destCoords, fraction);
  return {
    icao24: rowToIcao24(icaoPrefixHex2, row.tailNumber, index),
    callsign: `${airline.callsignPrefix}${row.flightNumber}`.trim(),
    originCountry: 'United States',
    longitude,
    latitude,
    baroAltitude: 9000 + (index % 25) * 500,
    velocity: 200 + (index % 30) * 5,
    trueTrack: index % 360,
    onGround: false,
    lastContact: Math.floor(Date.now() / 1000),
  };
}

export function rowToDetail(
  row: DepartureRow,
  origin: OriginConfig,
  airline: AirlineConfig,
): FlightDetail | null {
  const destCoords = getDestinationCoords(row.destinationIata);
  if (!destCoords) return null;
  const routeCoordinates = greatCirclePoints(origin.coords, destCoords, 64);
  const [schedH, schedM] = row.scheduledDep.split(':').map(Number);
  const depTime = `${row.date} ${String(schedH).padStart(2, '0')}:${String(schedM).padStart(2, '0')}`;
  const arrMin = schedH * 60 + schedM + row.scheduledElapsedMin;
  const arrTime = `${row.date} ${String(Math.floor(arrMin / 60) % 24).padStart(2, '0')}:${String(arrMin % 60).padStart(2, '0')}`;
  return {
    flightNumber: `${airline.callsignPrefix}${row.flightNumber}`,
    airline: airline.name,
    airlineIata: airline.iata,
    originIata: origin.iata,
    originCity: origin.city,
    originCoordinates: origin.coords,
    destinationIata: row.destinationIata,
    destinationCity: row.destinationIata,
    destinationCoordinates: destCoords,
    departureTime: depTime,
    arrivalTime: arrTime,
    status: 'active',
    aircraftType: 'Boeing 737',
    registration: row.tailNumber,
    routeCoordinates,
  };
}
