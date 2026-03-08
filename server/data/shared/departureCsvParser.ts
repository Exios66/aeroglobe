/**
 * Shared parser for BTS "Detailed Statistics Departures" CSV format.
 * First 7 lines are metadata, line 8 is header, then data rows.
 */
import { readFile } from 'fs/promises';
import type { AircraftState, FlightDetail } from '../../../src/types/flight';
import { getDestinationCoords } from './airportCoords';

export interface DepartureRow {
  carrierCode: string;
  date: string;
  flightNumber: string;
  tailNumber: string;
  destinationIata: string;
  scheduledDepartureTime: string;
  actualDepartureTime: string;
  scheduledElapsedMinutes: number;
  actualElapsedMinutes: number;
}

const HEADER_LINE_INDEX = 7;
const DATA_START_INDEX = 8;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
      if (c === '\r') break;
    } else {
      current += c;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

function parseNum(s: string, def: number): number {
  if (s == null || (typeof s === 'string' && s.trim() === '')) return def;
  const n = parseFloat(String(s).replace(/"/g, '').trim());
  return Number.isFinite(n) ? n : def;
}

export async function parseDeparturesCsv(csvPath: string): Promise<DepartureRow[]> {
  const text = await readFile(csvPath, 'utf-8');
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (lines.length < DATA_START_INDEX + 1) return [];

  const headers = parseCsvLine(lines[HEADER_LINE_INDEX]!).map((h) =>
    h.replace(/^"|"$/g, '').trim(),
  );
  const getIdx = (name: string): number => {
    const i = headers.findIndex((h) => h.includes(name) || h === name);
    return i >= 0 ? i : -1;
  };
  const idxCarrier = getIdx('Carrier Code');
  const idxDate = getIdx('Date');
  const idxFlightNum = getIdx('Flight Number');
  const idxTail = getIdx('Tail Number');
  const idxDest = getIdx('Destination Airport');
  const idxSchedDep = getIdx('Scheduled departure time');
  const idxActualDep = getIdx('Actual departure time');
  const idxSchedElapsed = getIdx('Scheduled elapsed time');
  const idxActualElapsed = getIdx('Actual elapsed time');

  if (
    idxCarrier < 0 ||
    idxDate < 0 ||
    idxFlightNum < 0 ||
    idxTail < 0 ||
    idxDest < 0 ||
    idxSchedDep < 0 ||
    idxActualDep < 0
  ) {
    return [];
  }

  const rows: DepartureRow[] = [];
  for (let i = DATA_START_INDEX; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = parseCsvLine(line);
    const carrier = (cells[idxCarrier] ?? '').replace(/^"|"$/g, '').trim();
    const dest = (cells[idxDest] ?? '').replace(/^"|"$/g, '').trim();
    if (!carrier || !dest) continue;
    rows.push({
      carrierCode: carrier,
      date: (cells[idxDate] ?? '').replace(/^"|"$/g, '').trim(),
      flightNumber: (cells[idxFlightNum] ?? '').replace(/^"|"$/g, '').trim(),
      tailNumber: (cells[idxTail] ?? '').replace(/^"|"$/g, '').trim(),
      destinationIata: dest,
      scheduledDepartureTime: (cells[idxSchedDep] ?? '').replace(/^"|"$/g, '').trim(),
      actualDepartureTime: (cells[idxActualDep] ?? '').replace(/^"|"$/g, '').trim(),
      scheduledElapsedMinutes: parseNum(cells[idxSchedElapsed] ?? '', 0),
      actualElapsedMinutes: parseNum(cells[idxActualElapsed] ?? '', 0),
    });
  }
  return rows;
}

function tailToIcao24(tail: string, index: number, icaoPrefix: string): string {
  let hash = 0;
  const s = tail + index;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  const hex = (hash % 0x10000).toString(16).padStart(4, '0').toLowerCase();
  return (icaoPrefix + hex).toLowerCase();
}

export interface OriginInfo {
  coords: [number, number];
  iata: string;
  city: string;
}

export interface AirlineInfo {
  iata: string;
  name: string;
  callsignPrefix: string;
}

export function rowToState(
  row: DepartureRow,
  index: number,
  origin: OriginInfo,
  airline: AirlineInfo,
  icaoPrefix: string,
): AircraftState | null {
  const icao24 = tailToIcao24(row.tailNumber, index, icaoPrefix);
  const callsign = `${airline.callsignPrefix}${row.flightNumber}`.trim() || null;
  return {
    icao24,
    callsign,
    originCountry: 'United States',
    longitude: origin.coords[0],
    latitude: origin.coords[1],
    baroAltitude: 35000 * 0.3048,
    velocity: 450,
    trueTrack: 0,
    onGround: false,
    lastContact: Math.floor(Date.now() / 1000),
  };
}

function addMinutesToTime(timeStr: string, minutes: number): string {
  const parts = timeStr.split(':');
  const h = parseNum(parts[0] ?? '0', 0);
  const m = parseNum(parts[1] ?? '0', 0);
  const totalM = (h * 60 + m + minutes) % (24 * 60);
  const hh = Math.floor(totalM / 60);
  const mm = totalM % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function rowToDetail(
  row: DepartureRow,
  origin: OriginInfo,
  airline: AirlineInfo,
): FlightDetail {
  const destCoords = getDestinationCoords(row.destinationIata);
  const departureTime = `${row.date} ${row.actualDepartureTime}`;
  const arrivalTime = `${row.date} ${addMinutesToTime(row.actualDepartureTime, row.actualElapsedMinutes)}`;
  return {
    flightNumber: row.flightNumber,
    airline: airline.name,
    airlineIata: airline.iata,
    originIata: origin.iata,
    originCity: origin.city,
    originCoordinates: origin.coords,
    destinationIata: row.destinationIata,
    destinationCity: row.destinationIata,
    destinationCoordinates: destCoords ?? undefined,
    departureTime,
    arrivalTime,
    status: 'landed',
    aircraftType: 'Unknown',
    registration: row.tailNumber,
    routeCoordinates: destCoords ? [origin.coords, destCoords] : [origin.coords],
  };
}
