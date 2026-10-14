import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../../src/components/layout/Shell';

vi.mock('../../src/globe/GlobeViewer', () => ({
  GlobeViewer: () => <div data-testid="globe" />,
}));
vi.mock('../../src/hooks/useGlobe', () => ({ useGlobe: () => {} }));

describe('Shell', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ flights: [], source: 'mock', stale: true }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the shell without crashing', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Shell />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('globe')).toBeTruthy();
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    expect(screen.getByText('AeroGlobe')).toBeTruthy();

    // let the mocked fetch settle so state updates land inside act()
    expect(await screen.findByText('Sample data')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Loading global flight traffic/)).toBeNull());
  });
});
