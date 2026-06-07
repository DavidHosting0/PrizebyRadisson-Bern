'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <ServiceWorkerRegister />
          {children}
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
