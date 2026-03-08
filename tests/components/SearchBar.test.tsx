import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from '../../src/components/search/SearchBar';
import { useFilterStore } from '../../src/store/filterStore';

describe('SearchBar', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [], source: 'mock' }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates and clears the shared search query', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <SearchBar />
      </QueryClientProvider>,
    );

    const input = screen.getByLabelText(/search flights/i);
    await user.type(input, 'DL214');
    expect(useFilterStore.getState().searchQuery).toBe('DL214');

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(useFilterStore.getState().searchQuery).toBe('');
  });
});
