import type { InputHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';

type SliderProps = InputHTMLAttributes<HTMLInputElement>;

export function Slider({ className, type = 'range', ...props }: SliderProps) {
  return (
    <input
      type={type}
      className={cn(
        'h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400',
        className,
      )}
      {...props}
    />
  );
}
