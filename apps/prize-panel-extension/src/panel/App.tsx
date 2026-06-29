import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, usePermission } from '@/lib/auth-context';
import { PANEL_MESSAGE } from '@/lib/storage';
import { BrandLogo } from '@/components/BrandLogo';
import { LoginForm } from '@/components/LoginForm';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ShiftHandoverBoard } from '@/components/ShiftHandoverBoard';
import { Button } from '@/components/ui/Button';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

function PanelHeader({
  onSettings,
  onCollapse,
}: {
  onSettings: () => void;
  onCollapse: () => void;
}) {
  const { user, logout } = useAuth();

  return (
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2.5">
      <BrandLogo compact />
      <div className="flex items-center gap-1">
        {user && (
          <span className="max-w-[100px] truncate text-xs text-ink-muted" title={user.name}>
            {user.name}
          </span>
        )}
        <button
          type="button"
          className="rounded-md p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          title="Einstellungen"
          aria-label="Einstellungen"
          onClick={onSettings}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
          title="Panel einklappen"
          aria-label="Panel einklappen"
          onClick={onCollapse}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        {user && (
          <Button type="button" variant="ghost" className="min-h-0 px-2 py-1 text-xs" onClick={logout}>
            Abmelden
          </Button>
        )}
      </div>
    </header>
  );
}

function PanelBody() {
  const { user, loading } = useAuth();
  const canReadHandover = usePermission('SHIFT_HANDOVER_READ');

  if (loading) {
    return <p className="p-4 text-sm text-ink-muted">Wird geladen…</p>;
  }

  if (!user) {
    return <LoginForm />;
  }

  if (!canReadHandover) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">
          Dein Konto hat keine Berechtigung für die Schichtübergabe. Bitte wende dich an einen
          Administrator.
        </p>
      </div>
    );
  }

  return <ShiftHandoverBoard />;
}

function AppInner() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  function collapsePanel() {
    window.parent.postMessage({ type: PANEL_MESSAGE.toggle }, '*');
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface">
      <PanelHeader onSettings={() => setSettingsOpen(true)} onCollapse={collapsePanel} />
      <main className="flex-1 overflow-y-auto">
        <PanelBody />
      </main>
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </QueryClientProvider>
  );
}
