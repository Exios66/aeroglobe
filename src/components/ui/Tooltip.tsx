import type { PropsWithChildren } from 'react';

type TooltipProps = PropsWithChildren<{
  text: string;
}>;

export function Tooltip({ text, children }: TooltipProps) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 rounded-lg border border-white/10 bg-slate-950/95 px-2 py-1 text-[10px] text-slate-200 shadow-glass group-hover:block">
        {text}
      </span>
    </span>
  );
}
