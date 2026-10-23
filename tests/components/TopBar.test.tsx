import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar } from '../../src/components/layout/TopBar';
import { useUiStore } from '../../src/store';

afterEach(cleanup);

describe('TopBar data source', () => {
  it.each([
    ['opensky', 'Live · OpenSky'], ['snapshot', 'OpenSky snapshot'],
    ['mock', 'Sample data'], ['fixtures', 'Sample data'], ['adsblol', 'Historical · adsb.lol'],
    ['static', 'Static preview'],
    [null, 'warming up'], ['', 'warming up'], ['unrecognised', 'warming up'],
  ])('labels source %s as %s', (source, label) => {
    render(<TopBar liveCount={0} lastUpdated={null} source={source} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('updates the source label when live data falls back to samples', () => {
    const { rerender } = render(<TopBar liveCount={1} lastUpdated={null} source="opensky" />);
    rerender(<TopBar liveCount={1} lastUpdated={null} source="mock" />);
    expect(screen.getByText('Sample data')).toBeInTheDocument();
    expect(screen.queryByText('Live · OpenSky')).not.toBeInTheDocument();
  });

  it('opens only one map panel at a time on a narrow screen', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      media: '(max-width: 767px)',
      addEventListener() {},
      removeEventListener() {},
    }));
    useUiStore.setState({ sidebarOpen: true, filterPanelOpen: false });
    render(<TopBar liveCount={1} lastUpdated={null} source="snapshot" />);
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(useUiStore.getState().filterPanelOpen).toBe(true);
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    vi.unstubAllGlobals();
  });
});
