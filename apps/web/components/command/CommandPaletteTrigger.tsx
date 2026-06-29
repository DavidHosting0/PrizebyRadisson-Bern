'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { emitCommandBus } from '@/lib/command-bus';
import { IconSearch } from '@/components/nav/nav-icons';

export function CommandPaletteTrigger({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={className}
      onClick={() => emitCommandBus({ type: 'palette:open' })}
      aria-label={label}
    >
      <IconSearch className="h-4 w-4" />
      {label && <span className="hidden sm:inline">{label}</span>}
    </Button>
  );
}

/** Global Cmd+K listener — works even when palette host is mounted. */
export function useGlobalCommandShortcut() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        emitCommandBus({ type: 'palette:open' });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
