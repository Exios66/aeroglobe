import { haversineDistance } from '../utils/geo';
import type { LogbookEntry } from './db';

const CSV_HEADER = 'id,date,flight,dep,arr,aircraft,registration,seat,notes,linked';
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

/**
 * CSV export (RFC 4180: CRLF rows, quoting only where required, never the header row).
 * Cells that could be misread as spreadsheet formulas (=, +, -, @) are neutralized with a
 * leading apostrophe so opening the export can never execute anything.
 */
export function toCsv(entries: LogbookEntry[]): string {
  const rows = entries.map((entry) => [
    entry.id,
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
  let cell = value;
  if (/^[=+@-]/.test(cell)) cell = `'${cell}`;
  return /["\r\n,]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * Parses the CSV export with a full-file tokenizer so quoted cells may embed commas,
 * quotes, and newlines exactly as `toCsv` writes them.
 */
export function fromCsv(csv: string): LogbookEntry[] {
  const rows = parseCsvDocument(csv);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  if (header.join(',') !== CSV_HEADER.split(',').join(',')) {
    throw new Error(`not a logbook CSV (expected header "${CSV_HEADER}")`);
  }
  return dataRows.map((cells) => {
    const [id, date, flightNumber, depIcao, arrIcao, aircraftType, registration, seat, notes, linkedFlightId] = cells;
    return validateEntry({
      id,
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

/**
 * Tokenizes a whole CSV document into rows of cells, honouring RFC 4180 quoting so cells may
 * embed commas, escaped quotes, and newlines exactly as `toCsv` writes them.
 */
function parseCsvDocument(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;
  let sawAnyCell = false;

  const pushCell = () => {
    row.push(current);
    current = '';
    sawAnyCell = true;
  };
  const pushRow = () => {
    pushCell();
    if (sawAnyCell) {
      rows.push(row);
      row = [];
      sawAnyCell = false;
    }
  };

  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (inQuotes) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          current += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' && current === '') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      pushCell();
      continue;
    }
    if (char === '\r') {
      if (csv[index + 1] === '\n') index++;
      pushRow();
      continue;
    }
    if (char === '\n') {
      pushRow();
      continue;
    }
    current += char;
    sawAnyCell = true;
  }
  if (current !== '' || sawAnyCell) pushRow();
  return rows;
}

/**
 * A real calendar-day check, not just the digit shape: `2026-02-31` constructs a rolled-over
 * March date, so its normalized UTC fields cannot round-trip to the same day.
 */
export function isValidIsoDay(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.getUTCFullYear() === Number(date.slice(0, 4))
    && parsed.getUTCMonth() + 1 === Number(date.slice(5, 7))
    && parsed.getUTCDate() === Number(date.slice(8, 10));
}

/** Reduces to the spec §6.7 shape; incomplete rows are dropped, not invented. */
function validateEntry(candidate: unknown): LogbookEntry {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('logbook entry is not an object');
  }
  const source = candidate as Partial<LogbookEntry>;
  if (!source.date || !isValidIsoDay(source.date)) {
    throw new Error(`logbook entry date must be a real ISO YYYY-MM-DD day (got ${JSON.stringify(source.date)})`);
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

/** A row valid enough to insert (real ISO date plus resolvable dep/arr). */
export function isImportable(entry: LogbookEntry): boolean {
  return isValidIsoDay(entry.date) && Boolean(entry.depIcao) && Boolean(entry.arrIcao);
}

/** Distance helper for the panel; pairs are [lon, lat]. */
export function pairKm(origin: [number, number] | undefined, destination: [number, number] | undefined): number | null {
  if (!origin || !destination) return null;
  return haversineDistance(origin, destination);
}
