import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TopBar } from '../../src/components/layout/TopBar';

afterEach(cleanup);

describe('TopBar data source', () => {
  it.each([
    ['opensky', 'Live · OpenSky'], ['mock', 'Sample data'], ['static', 'Static preview'],
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
});
