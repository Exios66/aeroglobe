import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Tooltip } from '../../src/components/ui/Tooltip';

afterEach(cleanup);

describe('Tooltip', () => {
  it('exposes the text as a tooltip that describes the trigger and shows on focus', () => {
    render(
      <Tooltip text="Helpful hint">
        <button type="button">Go</button>
      </Tooltip>,
    );
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).toHaveTextContent('Helpful hint');
    expect(tip.id).not.toBe('');
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('aria-describedby', tip.id);
    expect(tip.className).toContain('group-focus-within:block');
  });

  it('tolerates non-element children', () => {
    render(<Tooltip text="Hint">plain text</Tooltip>);
    expect(screen.getByText('plain text')).toBeInTheDocument();
  });

  it('keeps adjacent header controls from shrinking while preserving their tooltip associations', () => {
    render(
      <div className="flex overflow-x-auto">
        <Tooltip text="Change globe skin"><button type="button">Light skin</button></Tooltip>
        <Tooltip text="Toggle playback"><button type="button">Hide Timeline</button></Tooltip>
      </div>,
    );

    for (const name of ['Light skin', 'Hide Timeline']) {
      const trigger = screen.getByRole('button', { name });
      expect(trigger.parentElement).toHaveClass('inline-flex', 'shrink-0');
      expect(trigger).toHaveAccessibleDescription(name === 'Light skin' ? 'Change globe skin' : 'Toggle playback');
    }
    const tooltips = screen.getAllByRole('tooltip', { hidden: true });
    expect(tooltips[0].id).not.toBe(tooltips[1].id);
  });
});
