import { describe, expect, it } from 'vitest';
import {
  csvCell,
  fromCsv,
  fromJson,
  pairKm,
  isImportable,
  isValidIsoDay,
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

describe('isValidIsoDay', () => {
  it('rejects impossible calendar days, not just bad shapes', () => {
    expect(isValidIsoDay('2026-10-12')).toBe(true);
    expect(isValidIsoDay('2026-02-29')).toBe(false); // 2026 is not a leap year
    expect(isValidIsoDay('2026-02-31')).toBe(false);
    expect(isValidIsoDay('10-12-2026')).toBe(false);
  });
});

describe('CSV round-trip', () => {
  it('round-trips a full table including the stable id column', () => {
    const back = fromCsv(toCsv([entry]));
    expect(back[0]).toMatchObject({
      id: '1',
      date: '2026-10-12',
      flightNumber: 'UAL123',
      depIcao: 'KORD',
      arrIcao: 'KDEN',
      aircraftType: 'B738',
      seat: '12F',
      notes: 'Smooth ride, cherry views',
    });
  });

  it('round-trips quoted cells with embedded commas, quotes, and newlines', () => {
    const rowdy: LogbookEntry = { ...entry, id: 'rowdy', notes: 'Line one\ra comma, "a quote", and more' };
    const back = fromCsv(toCsv([entry, rowdy]));
    expect(back).toHaveLength(2);
    expect(back[1].notes).toBe('Line one\ra comma, "a quote", and more');
  });

  it('neutralizes spreadsheet-formula cells in the export', () => {
    expect(csvCell('=cmd|\' /C calc\'!A0')).toBe('\'=cmd|\' /C calc\'!A0');
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell('@from')).toBe("'@from");
    expect(csvCell('plain')).toBe('plain');
    expect(() => fromCsv('airline,code\r\nXX,1')).toThrow(/not a logbook CSV/);
  });

  it('imports hand-written plain rows both with and without the id column', () => {
    const csv = [
      'id,date,flight,dep,arr,aircraft,registration,seat,notes,linked',
      'import-1,2026-10-12,UAL123,KORD,KDEN,B738,N12345,12F,,',
      ',2026-10-13,DAL456,KDEN,KLAX,A320,N45678,,',
    ].join('\n');
    const rows = fromCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('import-1');
    expect(rows[1].id).toBe('2026-10-13-dal456');
    expect(rows.every(isImportable)).toBe(true);
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
