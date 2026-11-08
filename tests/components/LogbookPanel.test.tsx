import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LogbookPanel } from '../../src/components/logbook/LogbookPanel';
import { setLogbookStorage, useLogbookStore } from '../../src/logbook/logbookStore';
import { createMemoryLogbookStorage, type LogbookEntry } from '../../src/logbook/db';
import type { AirportRow } from '../../src/services/staticData';
import { useCatalogStore } from '../../src/store/catalogStore';

const airports = new Map<string, AirportRow>([
  ['KORD', ['KORD', 'ORD', "Chicago O'Hare", 'Chicago', 'US', 41.98, -87.9, 672, 'America/Chicago']],
  ['KDEN', ['KDEN', 'DEN', 'Denver International', 'Denver', 'US', 39.86, -104.67, 5433, 'America/Denver']],
]);
const entries: LogbookEntry[] = [
  { id: '1', date: '2026-10-12', flightNumber: 'UAL123', depIcao: 'KORD', arrIcao: 'KDEN' },
  { id: '2', date: '2026-10-11', flightNumber: 'DAL456', depIcao: 'KDEN', arrIcao: 'KLAX' },
];

describe('LogbookPanel', () => {
  beforeEach(() => {
    setLogbookStorage(createMemoryLogbookStorage(entries));
    useCatalogStore.setState({ records: [], airports, airlines: new Map(), dayDate: '2026-10-12' });
    useLogbookStore.setState({ panelOpen: false, loaded: false });
    void useLogbookStore.getState().load();
  });

  it('renders the dialog with stats and newest-first entries, then closes cleanly', async () => {
    useLogbookStore.setState({ panelOpen: true });
    const user = userEvent.setup();
    render(<LogbookPanel />);

    const dialog = screen.getByRole('dialog', { name: 'Personal logbook' });
    expect(within(dialog).getAllByText('2')[0]).toBeInTheDocument(); // flights count
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026-10-12');
    expect(rows[1]).toHaveTextContent('2026-10-11');

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(useLogbookStore.getState().panelOpen).toBe(false);
  });

  it('deletes an entry through the store', async () => {
    useLogbookStore.setState({ panelOpen: true, loaded: true });
    const user = userEvent.setup();
    render(<LogbookPanel />);

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    expect(useLogbookStore.getState().entries).toHaveLength(1);
  });

  it('is hidden until opened', () => {
    useLogbookStore.setState({ panelOpen: false });
    render(<LogbookPanel />);
    expect(screen.queryByRole('dialog', { name: 'Personal logbook' })).toBeNull();
  });
});
