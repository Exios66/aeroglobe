import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '../../utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
  }
>;

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300',
  secondary: 'border border-white/10 text-slate-200 hover:text-white',
  ghost: 'text-slate-400 hover:text-white',
};

export function Button({ children, className, variant = 'secondary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'rounded-full px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
