import { useCallback } from 'react';

/**
 * A ref callback that marks a panel `inert` and `aria-hidden` while it is closed, so hidden
 * controls are skipped by keyboard navigation and assistive tech (spec 6.5).
 */
export function usePanelInert<T extends HTMLElement>(hidden: boolean) {
  return useCallback(
    (node: T | null) => {
      if (!node) return;
      if (hidden) {
        node.setAttribute('inert', '');
        node.setAttribute('aria-hidden', 'true');
      } else {
        node.removeAttribute('inert');
        node.removeAttribute('aria-hidden');
      }
    },
    [hidden],
  );
}
