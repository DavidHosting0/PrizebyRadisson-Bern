'use client';

import { useEffect, useState } from 'react';

/**
 * Soft-keyboard inset from the bottom of the layout viewport (px).
 * Used to `position: fixed; bottom: inset` the chat composer on iOS —
 * sizing the whole chat to visualViewport left a gap under the field.
 */
export function useKeyboardBottomInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) {
      setInset(0);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setInset(next);
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [active]);

  return inset;
}
