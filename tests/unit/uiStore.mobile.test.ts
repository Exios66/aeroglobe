import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('mobile panel defaults', () => {
  it('keeps the map clear when the viewport is a phone', async () => {
    vi.resetModules();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { useUiStore } = await import('../../src/store/uiStore');
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    expect(useUiStore.getState().filterPanelOpen).toBe(false);
  });
});
