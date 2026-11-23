'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * While `active`, size `rootRef` so it ends at the visual viewport bottom
 * (just above the soft keyboard). Avoids paddingBottom, which stacks with
 * iOS scroll-into-view and leaves an empty strip under the composer.
 */
export function useFitToVisualViewport(
  rootRef: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!root) return;

    const clear = () => {
      root.style.height = '';
      root.style.maxHeight = '';
    };

    if (!active || !vv) {
      clear();
      return;
    }

    const sync = () => {
      const top = root.getBoundingClientRect().top;
      const visualBottom = vv.offsetTop + vv.height;
      const available = Math.round(visualBottom - top);
      if (available > 120) {
        root.style.height = `${available}px`;
        root.style.maxHeight = `${available}px`;
      } else {
        clear();
      }
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      clear();
    };
  }, [rootRef, active]);
}
