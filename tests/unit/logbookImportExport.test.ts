import { describe, expect, it } from 'vitest';
import {
  csvCell,
  fromCsv,
  fromJson,
  pairKm,
  isImportable,
  toCsv,
  toJson,
} from '../../src/logbook/csvImportExport';
import {
  createMemoryLogbookStorage,
  type LogbookEntry,
} from '../../src/logbook/db';

const entry: LogbookEntry = {
  id: '1',
  date: '2026-10-12',
  flightNumber: 'UAL123',
  depIcao: 'KORD',
  arrIcao: 'KDEN',
  aircraftType: 'B738',
  registration: 'N12345',
  seat: '12F',
  notes: 'Smooth ride, cherry views',
};

describe('JSON round-trip', () => {
  it('round-trips the export-come-import shape and rejects wrong shapes', () => {
    const back = fromJson(toJson([entry]));
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ ...entry, id: entry.id });
    expect(() => fromJson('{"not":"a logbook"}')).toThrow(/not a logbook export/);
    expect(() => fromJson('{"v":1,"entries":[{ "date": "12 Oct 2026" }]}')).toThrow(/ISO YYYY-MM-DD/);
  });
});

describe('CSV round-trip', () => {
  it('round-trips a full table and quotes embedded commas when parsing', () => {
    const back = fromCsv(toCsv([entry]));
    expect(back[0]).toMatchObject({
      date: '2026-10-12',
      flightNumber: 'UAL123',
      depIcao: 'KORD',
      arrIcao: 'KDEN',
      aircraftType: 'B738',
      seat: '12F',
      notes: 'Smooth ride, cherry views',
    });
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('plain')).toBe('plain');
    expect(() => fromCsv('airline,code\r\nXX,1')).toThrow(/not a logbook CSV/);
  });

  it('imports hand-written plain rows', () => {
    const csv = [
      'date,flight,dep,arr,aircraft,registration,seat,notes,linked',
      '2026-10-12,UAL123,KORD,KDEN,B738,N12345,12F,,',
    ].join('\n');
    const rows = fromCsv(csv);
    expect(rows).toHaveLength(1);
    expect(isImportable(rows[0])).toBe(true);
  });
});

describe('pairKm', () => {
  it('measures the great-circle distance and degrades for missing pairs', () => {
    const km = pairKm([-87.9, 41.98], [-104.67, 39.86]);
    expect(km).toBeGreaterThan(1400);
    expect(km).toBeLessThan(1450);
    expect(pairKm(undefined, [-104.67, 39.86])).toBeNull();
    expect(pairKm([-87.9, 41.98], undefined)).toBeNull();
  });
});

describe('createMemoryLogbookStorage', () => {
  it('persists, sorts newest first, and clears', async () => {
    const storage = createMemoryLogbookStorage([entry]);
    await storage.put({
      id: '2',
      date: '2026-10-13',
      depIcao: 'KORD',
      arrIcao: 'KJFK',
    });
    expect((await storage.all()).map((item) => item.id)).toEqual(['2', '1']);
    await storage.remove('1');
    expect(await storage.all()).toHaveLength(1);
    await storage.clear();
    expect(await storage.all()).toEqual([]);
  });
});
