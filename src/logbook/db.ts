/**
 * Personal logbook persistence. A small typed IndexedDB wrapper (zero dependencies) with an
 * injectable storage backend so unit tests can run an in-memory implementation instead of
 * IndexedDB. Entries follow spec §6.7:
 * { id, date, flightNumber?, depIcao, arrIcao, aircraftType?, registration?, seat?, notes?, linkedFlightId? }
 */
export interface LogbookEntry {
  id: string;
  /** Local date the flight was flown, ISO `YYYY-MM-DD`. */
  date: string;
  flightNumber?: string;
  depIcao: string | null;
  arrIcao: string | null;
  aircraftType?: string;
  registration?: string;
  seat?: string;
  notes?: string;
  /** `FlightRecord.id` when the entry is linked to a day in the data catalog. */
  linkedFlightId?: string;
}

export interface LogbookStorage {
  all(): Promise<LogbookEntry[]>;
  put(entry: LogbookEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'aeroglobe-logbook';
const STORE_NAME = 'logbook';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB not available'));
  });
}

/** IndexedDB-backed storage with the request/transaction plumbing kept inside this file. */
export function createIndexedDbLogbookStorage(): LogbookStorage {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => {
    dbPromise ??= openDatabase();
    return dbPromise;
  };

  const run = <T>(mode: 'readonly' | 'readwrite', body: (store: IDBObjectStore) => IDBRequest): Promise<T> =>
    db().then(
      (database) =>
        new Promise<T>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, mode);
          const request = body(transaction.objectStore(STORE_NAME));
          request.onerror = () => reject(request.error ?? new Error(`logbook ${mode} failed`));
          transaction.onerror = () => reject(transaction.error ?? new Error(`logbook ${mode} transaction failed`));
          // The write counts only when the transaction commits (CodeRabbit finding on db.ts).
          transaction.oncomplete = () => resolve(request.result as T);
          transaction.onabort = () => reject(transaction.error ?? new Error(`logbook ${mode} transaction aborted`));
        }),
    );

  return {
    all: async () => {
      const entries = await run<LogbookEntry[]>('readonly', (store) => store.getAll());
      return entries.sort((a, b) => b.date.localeCompare(a.date));
    },
    put: async (entry) => {
      await run<void>('readwrite', (store) => store.put(entry));
    },
    remove: async (id) => {
      await run<void>('readwrite', (store) => store.delete(id));
    },
    clear: async () => {
      await run<void>('readwrite', (store) => store.clear());
    },
  };
}

/** In-memory backend, used when IndexedDB is missing and by tests. */
export function createMemoryLogbookStorage(initial: LogbookEntry[] = []): LogbookStorage {
  const entries = new Map<string, LogbookEntry>();
  for (const entry of initial) entries.set(entry.id, entry);
  return {
    all: async () => [...entries.values()].sort((a, b) => b.date.localeCompare(a.date)),
    put: async (entry) => {
      entries.set(entry.id, entry);
    },
    remove: async (id) => {
      entries.delete(id);
    },
    clear: async () => {
      entries.clear();
    },
  };
}

/** The global backend: IndexedDB where present, in-memory otherwise. */
export function createDefaultLogbookStorage(): LogbookStorage {
  return typeof indexedDB !== 'undefined' ? createIndexedDbLogbookStorage() : createMemoryLogbookStorage();
}
