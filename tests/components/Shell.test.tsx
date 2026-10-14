import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubStaticDataFetch } from '../helpers/staticData';

vi.mock('../../src/globe/GlobeViewer', () => ({
  GlobeViewer: () => <div data-testid="globe" />,
}));
vi.mock('../../src/hooks/useGlobe', () => ({ useGlobe: () => {} }));

describe('Shell', () => {
  beforeEach(() => {
    vi.resetModules();
    // Production build without an API base: the shell must load the static catalog.
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_DATA_BASE_URL', '');
    stubStaticDataFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it(
    'renders the shell and loads the static hour chunk without crashing',
    async () => {
    const { Shell } = await import('../../src/components/layout/Shell');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Shell />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('globe')).toBeTruthy();
    expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    expect(screen.getByText('AeroGlobe')).toBeTruthy();

    // let the mocked static load settle so state updates land inside act(), then confirm the
    // hook actually requested the static catalog and newest hour chunk through the data base.
    await waitFor(() => expect(screen.queryByText(/Loading global flight traffic/)).toBeNull());
    const fetchMock = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/data/catalog.json');
    expect(urls.some((u) => u.includes('tracks/2026-10-12/00.json'))).toBe(true);
    },
    15_000,
  );
});
