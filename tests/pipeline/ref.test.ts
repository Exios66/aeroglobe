// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildAirlines, buildAirports } from '../../pipeline/ref';

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

describe('buildAirports', () => {
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
