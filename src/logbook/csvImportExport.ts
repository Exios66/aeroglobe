import { haversineDistance } from '../utils/geo';
import type { LogbookEntry } from './db';

const CSV_HEADER = 'date,flight,dep,arr,aircraft,registration,seat,notes,linked';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Serializes the logbook to a stable, versioned JSON document. */
export function toJson(entries: LogbookEntry[]): string {
  return JSON.stringify({ v: 1, entries }, null, 2);
}

/** Parses the JSON export; unknown shapes are rejected loudly rather than half-imported. */
export function fromJson(json: string): LogbookEntry[] {
  const body = JSON.parse(json) as { v: number; entries: unknown };
  if (!Array.isArray(body.entries) || typeof body.v !== 'number') {
    throw new Error('not a logbook export (expected { v, entries })');
  }
  return body.entries.map((entry) => validateEntry(entry));
}

/** CSV export (RFC 4180: CRLF rows, quoting only where required, never the header row). */
export function toCsv(entries: LogbookEntry[]): string {
  const rows = entries.map((entry) => [
    entry.date,
    entry.flightNumber ?? '',
    entry.depIcao ?? '',
    entry.arrIcao ?? '',
    entry.aircraftType ?? '',
    entry.registration ?? '',
    entry.seat ?? '',
    entry.notes ?? '',
    entry.linkedFlightId ?? '',
  ].map(csvCell));
  return [CSV_HEADER, ...rows.map((row) => row.join(','))].join('\r\n');
}

export function csvCell(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Parses the CSV export; tolerates plain and quoted cells (with embedded commas). */
export function fromCsv(csv: string): LogbookEntry[] {
  const lines = csv.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const [header, ...rows] = lines;
  if (header !== CSV_HEADER) {
    throw new Error(`not a logbook CSV (expected header "${CSV_HEADER}")`);
  }
  return rows.map((row) => {
    const cells = parseCsvRow(row);
    const [date, flightNumber, depIcao, arrIcao, aircraftType, registration, seat, notes, linkedFlightId] = cells;
    return validateEntry({
      date,
      flightNumber,
      depIcao: depIcao || null,
      arrIcao: arrIcao || null,
      aircraftType,
      registration,
      seat,
      notes,
      linkedFlightId,
    });
  });
}

function parseCsvRow(row: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let index = 0; index < row.length; index++) {
    const char = row[index];
    if (char === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

/** Reduces to the spec §6.7 shape; incomplete rows are dropped, not invented. */
function validateEntry(candidate: unknown): LogbookEntry {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('logbook entry is not an object');
  }
  const source = candidate as Partial<LogbookEntry>;
  if (!source.date || !ISO_DATE.test(source.date)) {
    throw new Error(`logbook entry date must be an ISO YYYY-MM-DD day (got ${JSON.stringify(source.date)})`);
  }
  return {
    id: typeof source.id === 'string' && source.id
      ? source.id
      : `${source.date}-${(source.flightNumber ?? source.depIcao ?? 'entry').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    date: source.date,
    flightNumber: source.flightNumber || undefined,
    depIcao: source.depIcao ?? null,
    arrIcao: source.arrIcao ?? null,
    aircraftType: source.aircraftType || undefined,
    registration: source.registration || undefined,
    seat: source.seat || undefined,
    notes: source.notes || undefined,
    linkedFlightId: source.linkedFlightId || undefined,
  };
}

/** A row valid enough to insert (ISO date plus resolvable dep/arr). */
export function isImportable(entry: LogbookEntry): boolean {
  return ISO_DATE.test(entry.date) && Boolean(entry.depIcao) && Boolean(entry.arrIcao);
}

/** Distance helper for the panel; pairs are [lon, lat]. */
export function pairKm(origin: [number, number] | undefined, destination: [number, number] | undefined): number | null {
  if (!origin || !destination) return null;
  return haversineDistance(origin, destination);
}
