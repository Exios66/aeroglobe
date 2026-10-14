export type AirportRow = [
  icao: string,
  iata: string | null,
  name: string,
  city: string,
  country: string,
  lat: number,
  lon: number,
  elevFt: number,
  tz: string | null,
];
export type AirlineRow = [icao: string, iata: string | null, name: string, callsign: string | null];

/** RFC-4180 parser: quoted fields may contain commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let rec: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      rec.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rec.push(field);
      field = '';
      if (rec.length > 1 || rec[0] !== '') records.push(rec);
      rec = [];
    } else field += c;
  }
  if (field !== '' || rec.length > 0) {
    rec.push(field);
    records.push(rec);
  }
  return records;
}

function csvLine(fields: string[]): string {
  return fields.map((f) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(',');
}

function nullable(v: string | undefined): string | null {
  return v === undefined || v === '' || v === '\\N' || v === '-' ? null : v;
}

interface OurAirport {
  icao: string;
  rec: string[];
  col: Map<string, number>;
}

/** The shared OurAirports filter; returns kept records (header excluded) with their resolved ICAO. */
function filterOurAirports(csv: string): { header: string[]; kept: OurAirport[] } {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return { header: [], kept: [] };
  const col = new Map(header.map((h, i) => [h, i]));
  const get = (r: string[], k: string) => r[col.get(k) ?? -1] ?? '';
  const kept: OurAirport[] = [];
  for (const rec of rows) {
    const type = get(rec, 'type');
    if (!(type === 'large_airport' || (type === 'medium_airport' && get(rec, 'scheduled_service') === 'yes'))) continue;
    const gps = get(rec, 'gps_code');
    const icao = get(rec, 'icao_code') || (/^[A-Za-z]{4}$/.test(gps) ? gps : '');
    if (icao) kept.push({ icao: icao.toUpperCase(), rec, col });
  }
  return { header, kept };
}

/** Filtered OurAirports CSV (original header, kept rows only); re-filtering it is idempotent. */
export function filterOurAirportsCsv(csv: string): string {
  const { header, kept } = filterOurAirports(csv);
  return [header, ...kept.map((k) => k.rec)].map(csvLine).join('\n') + '\n';
}

export function buildAirports(ourAirportsCsv: string, openflightsAirportsDat: string): AirportRow[] {
  // OpenFlights airports.dat, 0-based: 5 = ICAO, 11 = IANA tz database name.
  // (The plan's "column 12 by ICAO column 6" is the same data in 1-based numbering.)
  const tz = new Map<string, string>();
  for (const r of parseCsv(openflightsAirportsDat)) {
    const icao = nullable(r[5]);
    const z = nullable(r[11]);
    if (icao && z) tz.set(icao.toUpperCase(), z);
  }
  const byIcao = new Map<string, AirportRow>();
  for (const { icao, rec, col } of filterOurAirports(ourAirportsCsv).kept) {
    if (byIcao.has(icao)) continue;
    const get = (k: string) => rec[col.get(k) ?? -1] ?? '';
    const elev = parseFloat(get('elevation_ft'));
    byIcao.set(icao, [
      icao,
      get('iata_code') || null,
      get('name'),
      get('municipality'),
      get('iso_country'),
      parseFloat(get('latitude_deg')),
      parseFloat(get('longitude_deg')),
      Number.isFinite(elev) ? Math.round(elev) : 0,
      tz.get(icao) ?? null,
    ]);
  }
  return [...byIcao.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

export function buildAirlines(openflightsAirlinesDat: string): AirlineRow[] {
  // airlines.dat, 0-based: 1 name, 3 IATA, 4 ICAO, 5 callsign, 7 active.
  const byIcao = new Map<string, AirlineRow>();
  for (const r of parseCsv(openflightsAirlinesDat)) {
    if (r[7] !== 'Y') continue;
    const icao = r[4] ?? '';
    if (!/^[A-Z]{3}$/.test(icao) || byIcao.has(icao)) continue;
    byIcao.set(icao, [icao, nullable(r[3]), r[1] ?? '', nullable(r[5])]);
  }
  return [...byIcao.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}
