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
});
