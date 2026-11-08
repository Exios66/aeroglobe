import { create } from 'zustand';
import {
  createDefaultLogbookStorage,
  type LogbookEntry,
  type LogbookStorage,
} from './db';

/**
 * Personal logbook state (spec §6.7): local-first entries in IndexedDB when available,
 * in-memory otherwise. Load happens lazily/once per session; all writes are awaited through
 * the storage backend so the store is the only place monorepo code touches persistence.
 */
interface LogbookStoreState {
  entries: LogbookEntry[];
  loaded: boolean;
  loadError: string | null;
  panelOpen: boolean;
  setPanelOpen: (value: boolean) => void;
  load: () => Promise<void>;
  add: (entry: Omit<LogbookEntry, 'id'> & { id?: string }) => Promise<LogbookEntry>;
  update: (id: string, patch: Partial<LogbookEntry>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  importEntries: (entries: LogbookEntry[]) => Promise<void>;
  reset: () => Promise<void>;
}

let storage: LogbookStorage = createDefaultLogbookStorage();

/** Swaps the storage backend (tests inject the in-memory one) and resets cached state. */
export function setLogbookStorage(next: LogbookStorage): void {
  storage = next;
  useLogbookStore.setState({ entries: [], loaded: false, loadError: null });
}

export function getLogbookStorage(): LogbookStorage {
  return storage;
}

function sorted(entries: LogbookEntry[]): LogbookEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export const useLogbookStore = create<LogbookStoreState>((set, get) => ({
  entries: [],
  loaded: false,
  loadError: null,
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  load: async () => {
    try {
      const entries = await storage.all();
      set({ entries: sorted(entries), loaded: true, loadError: null });
    } catch (error) {
      set({ loaded: true, loadError: error instanceof Error ? error.message : 'logbook unavailable' });
    }
  },
  add: async (draft) => {
    const entry: LogbookEntry = {
      id: draft.id ?? `lb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      date: draft.date,
      flightNumber: draft.flightNumber,
      depIcao: draft.depIcao,
      arrIcao: draft.arrIcao,
      aircraftType: draft.aircraftType,
      registration: draft.registration,
      seat: draft.seat,
      notes: draft.notes,
      linkedFlightId: draft.linkedFlightId,
    };
    await storage.put(entry);
    set({ entries: sorted([entry, ...get().entries]) });
    return entry;
  },
  update: async (id, patch) => {
    const current = get().entries.find((entry) => entry.id === id);
    if (!current) return;
    const next = { ...current, ...patch, id };
    await storage.put(next);
    set({ entries: sorted(get().entries.map((entry) => (entry.id === id ? next : entry))) });
  },
  remove: async (id) => {
    await storage.remove(id);
    set({ entries: get().entries.filter((entry) => entry.id !== id) });
  },
  importEntries: async (incoming) => {
    for (const entry of incoming) {
      await storage.put(entry);
    }
    const merged = new Map(get().entries.map((entry) => [entry.id, entry]));
    for (const entry of incoming) merged.set(entry.id, entry);
    set({ entries: sorted([...merged.values()]) });
  },
  reset: async () => {
    await storage.clear();
    set({ entries: [] });
  },
}));
