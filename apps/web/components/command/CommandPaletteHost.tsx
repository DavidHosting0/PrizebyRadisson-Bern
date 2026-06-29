'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { subscribeCommandBus } from '@/lib/command-bus';
import { CommandPalette } from '@/components/command/CommandPalette';

export function CommandPaletteHost() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    return subscribeCommandBus((e) => {
      if (e.type === 'palette:open') setOpen(true);
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading || !user) return null;

  return <CommandPalette open={open} onOpenChange={setOpen} />;
}
