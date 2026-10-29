import { Children, cloneElement, isValidElement, useId } from 'react';
import type { PropsWithChildren, ReactElement } from 'react';

type TooltipProps = PropsWithChildren<{
  text: string;
}>;

/** Wraps children with a text tooltip shown on hover or keyboard focus; a single element child is described by it. */
export function Tooltip({ text, children }: TooltipProps) {
  const id = useId();
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const trigger = isValidElement(only)
    ? cloneElement(only as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': id })
    : children;

  return (
    <span className="group relative inline-flex shrink-0">
      {trigger}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute -top-9 left-1/2 hidden -translate-x-1/2 rounded-lg border border-white/10 bg-slate-950/95 px-2 py-1 text-[10px] text-slate-200 shadow-glass group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
