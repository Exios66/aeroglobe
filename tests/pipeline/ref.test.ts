// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAirlines, buildAirports, filterOurAirportsCsv, parseCsv } from '../../pipeline/ref';

const HEADER =
  '"id","ident","type","name","latitude_deg","longitude_deg","elevation_ft","continent","iso_country","iso_region","municipality","scheduled_service","icao_code","iata_code","gps_code","local_code","home_link","wikipedia_link","keywords"';
const CSV = [
  HEADER,
  '3622,"KORD","large_airport","Chicago O\'Hare, International Airport",41.9786,-87.9048,672,"NA","US","US-IL","Chicago","yes","KORD","ORD","KORD","ORD",,,',
  '3500,"EGLL","medium_airport","London Heathrow",51.4706,-0.461941,,"EU","GB","GB-ENG","London","yes","EGLL",,"EGLL",,,,',
  '3501,"KXYZ","medium_airport","Unscheduled Field",40,-100,1000,"NA","US","US-NE","Nowhere","no","KXYZ",,"KXYZ",,,,',
  '3502,"KHLI","heliport","Some Heliport",40,-90,100,"NA","US","US-IL","Chicago","no","KHLI",,"KHLI",,,,',
].join('\n');
const DAT = [
  '3830,"Chicago O\'Hare International Airport","Chicago","United States","ORD","KORD",41.9786,-87.9048,672,-6,"A","America/Chicago","airport","OurAirports"',
  '507,"London Heathrow Airport","London","United Kingdom","LHR","EGLL",51.4706,-0.461941,83,0,"E",\\N,"airport","OurAirports"',
].join('\n');

describe('parseCsv', () => {
  it('preserves quoted commas, escaped quotes, newlines and trailing empty fields', () => {
    expect(parseCsv('a,"b,b","say ""hello""","line1\r\nline2",\r\n\r\nx,y,')).toEqual([
      ['a', 'b,b', 'say "hello"', 'line1\r\nline2', ''],
      ['x', 'y', ''],
    ]);
  });

  it.each(['\n', '\r', '\r\n'])('accepts line ending %j without requiring a final newline', (eol) => {
    expect(parseCsv(`a,b${eol}c,d`)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles empty input and explicit empty fields', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\r\n\n')).toEqual([]);
    expect(parseCsv(',\n')).toEqual([['', '']]);
  });
});

describe('filterOurAirportsCsv', () => {
  it('preserves the header and quoted field contents and is idempotent', () => {
    const filtered = filterOurAirportsCsv(CSV);
    expect(parseCsv(filtered)).toEqual([parseCsv(CSV)[0], ...parseCsv(CSV).slice(1, 3)]);
    expect(filterOurAirportsCsv(filtered)).toBe(filtered);
    expect(buildAirports(filtered, DAT)).toEqual(buildAirports(CSV, DAT));
  });
});

describe('buildAirports', () => {
  it('normalises ICAO case, prefers explicit ICAO, and keeps the first duplicate', () => {
    const csv = [
      'type,name,icao_code,gps_code,latitude_deg,longitude_deg,elevation_ft',
      'large_airport,First,kabc,KXYZ,1,2,12.7',
      'large_airport,Duplicate,KABC,,3,4,99',
    ].join('\n');
    const dat = '1,Airport,City,Country,,kabc,1,2,0,0,,Etc/UTC';
    expect(buildAirports(csv, dat)).toEqual([['KABC', null, 'First', '', '', 1, 2, 13, 'Etc/UTC']]);
  });

  it.each(['', 'ABC', 'ABCDE', '1234', 'AB12'])('rejects invalid GPS fallback %j', (gps) => {
    expect(buildAirports(`type,gps_code\nlarge_airport,${gps}`, '')).toEqual([]);
  });

  it('falls back to a valid gps_code when icao_code is malformed', () => {
    const csv = 'type,icao_code,gps_code,latitude_deg,longitude_deg\nlarge_airport,???,KORD,41,-87';
    expect(buildAirports(csv, '').map((r) => r[0])).toEqual(['KORD']);
    const bad = 'type,icao_code,gps_code,latitude_deg,longitude_deg\nlarge_airport,???,12,41,-87';
    expect(buildAirports(bad, '')).toEqual([]);
  });

  it.each([['91', '0'], ['-91', '0'], ['0', '181'], ['0', '-181'], ['', '0'], ['x', 'y']])(
    'skips airports with invalid coordinates %s,%s', (lat, lon) => {
      const csv = `type,icao_code,latitude_deg,longitude_deg\nlarge_airport,KABC,${lat},${lon}`;
      expect(buildAirports(csv, '')).toEqual([]);
    },
  );

  it('handles absent reference inputs', () => {
    expect(buildAirports('', '')).toEqual([]);
    expect(buildAirports(HEADER, '')).toEqual([]);
  });
  const rows = buildAirports(CSV, DAT);
  it('keeps large and scheduled medium airports, sorted by icao', () => {
    expect(rows.map((r) => r[0])).toEqual(['EGLL', 'KORD']);
  });
  it('drops unscheduled medium airports and heliports', () => {
    expect(rows.find((r) => r[0] === 'KXYZ' || r[0] === 'KHLI')).toBeUndefined();
  });
  it('joins tz by ICAO and maps \\N to null', () => {
    expect(rows.find((r) => r[0] === 'KORD')![8]).toBe('America/Chicago');
    expect(rows.find((r) => r[0] === 'EGLL')![8]).toBeNull();
  });
  it('parses quoted commas, iata null when empty, missing elevation 0', () => {
    expect(rows.find((r) => r[0] === 'KORD')).toEqual([
      'KORD', 'ORD', "Chicago O'Hare, International Airport", 'Chicago', 'US', 41.9786, -87.9048, 672, 'America/Chicago',
    ]);
    const egll = rows.find((r) => r[0] === 'EGLL')!;
    expect(egll[1]).toBeNull();
    expect(egll[7]).toBe(0);
  });
  it('falls back to a 4-letter gps_code when icao_code is empty', () => {
    const csv = HEADER + '\n1,"X","large_airport","Fallback",1,2,3,"NA","US","US-IL","C","yes",,,"KABC",,,,';
    expect(buildAirports(csv, '').map((r) => r[0])).toEqual(['KABC']);
  });
});

describe('buildAirlines', () => {
  it('keeps the first duplicate and rejects invalid or inactive ICAO entries', () => {
    const dat = [
      '1,First,,\\N,AAA,\\N,,Y',
      '2,Duplicate,,AA,AAA,SECOND,,Y',
      ...['aaA', 'AB', 'ABCD', 'A1B'].map((icao) => `3,Invalid,,,${icao},,,Y`),
      '4,Inactive,,,BBB,,,N',
    ].join('\n');
    expect(buildAirlines(dat)).toEqual([['AAA', null, 'First', null]]);
    expect(buildAirlines('')).toEqual([]);
  });
  const DAT_AL = [
    '1,"United Airlines",\\N,"UA","UAL","UNITED","United States","Y"',
    '2,"Dead Air",\\N,"DD","DED","DEAD","United States","N"',
    '3,"No Icao",\\N,"NI",\\N,\\N,"United States","Y"',
    '4,"Private flight",\\N,"-","N/A","","","Y"',
    '5,"Alpha Air",\\N,"-","AAA","","X","Y"',
  ].join('\n');
  it('keeps active airlines with 3-letter ICAO, sorted, nulling - and empty', () => {
    expect(buildAirlines(DAT_AL)).toEqual([
      ['AAA', null, 'Alpha Air', null],
      ['UAL', 'UA', 'United Airlines', 'UNITED'],
    ]);
  });
});
