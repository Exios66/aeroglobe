import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type ToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function Toggle({ active = false, className, children, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition',
        active
          ? 'border-cyan-400 bg-cyan-400/10 text-cyan-200'
          : 'border-white/10 text-slate-300 hover:text-white',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
