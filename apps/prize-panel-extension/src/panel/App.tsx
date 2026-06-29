import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, usePermission } from '@/lib/auth-context';
import { PANEL_MESSAGE } from '@/lib/storage';
import { BrandLogo } from '@/components/BrandLogo';
import { LoginForm } from '@/components/LoginForm';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ShiftHandoverBoard } from '@/components/ShiftHandoverBoard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-muted hover:text-ink"
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

function PanelHeader({
  onSettings,
  onCollapse,
  onLogout,
}: {
  onSettings: () => void;
  onCollapse: () => void;
  onLogout: () => void;
}) {
  const { user } = useAuth();

  return (
    <header className="flex shrink-0 items-center justify-between gap-1.5 border-b border-border bg-surface px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <BrandLogo compact />
        {user && (
          <p className="mt-0.5 truncate text-[10px] text-ink-muted" title={user.email}>
            {user.name}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {user && (
          <>
            <IconButton label="Einstellungen" onClick={onSettings}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </IconButton>
            <IconButton label="Abmelden" onClick={onLogout}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconButton>
          </>
        )}
        <IconButton label="Panel einklappen" onClick={onCollapse}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconButton>
      </div>
    </header>
  );
}

function PanelBody() {
  const { user, loading } = useAuth();
  const canReadHandover = usePermission('SHIFT_HANDOVER_READ');

  if (loading) {
    return <p className="p-3 text-xs text-ink-muted">Wird geladen…</p>;
  }

  if (!user) {
    return <LoginForm />;
  }

  if (!canReadHandover) {
    return (
      <div className="p-3">
        <p className="text-xs text-ink-muted">
          Keine Berechtigung für die Schichtübergabe.
        </p>
      </div>
    );
  }

  return <ShiftHandoverBoard />;
}

function AppInner() {
  const { logout } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  function collapsePanel() {
    window.parent.postMessage({ type: PANEL_MESSAGE.toggle }, '*');
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface text-[13px]">
      <PanelHeader
        onSettings={() => setSettingsOpen(true)}
        onCollapse={collapsePanel}
        onLogout={logout}
      />
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
