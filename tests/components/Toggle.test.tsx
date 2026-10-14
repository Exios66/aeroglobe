import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toggle } from '../../src/components/ui/Toggle';

afterEach(cleanup);

describe('Toggle', () => {
  it('forwards button attributes and click events without submitting its surrounding form', async () => {
    const click = vi.fn();
    const submit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submit}><Toggle aria-label="Airline" onClick={click}>UAL</Toggle></form>);
    await userEvent.click(screen.getByRole('button', { name: 'Airline' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });

  it('honours disabled and active state and additional classes', async () => {
    const click = vi.fn();
    const { rerender } = render(<Toggle disabled active className="custom" onClick={click}>UAL</Toggle>);
    const button = screen.getByRole('button', { name: 'UAL' });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('border-cyan-400', 'custom');
    await userEvent.click(button);
    expect(click).not.toHaveBeenCalled();
    rerender(<Toggle>UAL</Toggle>);
    expect(button).toBeEnabled();
    expect(button).not.toHaveClass('border-cyan-400');
  });
});
