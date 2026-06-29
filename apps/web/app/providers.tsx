'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { LocaleProvider } from '@/lib/locale-context';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { CommandPaletteHost } from '@/components/command/CommandPaletteHost';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <LocaleProvider>
          <ToastProvider>
            <ServiceWorkerRegister />
            <CommandPaletteHost />
            {children}
          </ToastProvider>
        </LocaleProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
