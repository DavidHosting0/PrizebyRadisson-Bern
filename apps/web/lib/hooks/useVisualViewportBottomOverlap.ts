'use client';

import { useEffect, useState } from 'react';

/**
 * Pixels of the layout viewport covered from the bottom (soft keyboard, browser chrome).
 * Used to lift chat composers into the visible area on mobile.
 */
export function useVisualViewportBottomOverlap(): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setOverlap(next);
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
  }, []);

  return overlap;
}
