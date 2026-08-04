import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, usePermission } from '@/lib/auth-context';
import { PANEL_MESSAGE } from '@/lib/storage';
import { BrandLogo } from '@/components/BrandLogo';
import { LoginForm } from '@/components/LoginForm';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ShiftHandoverBoard } from '@/components/ShiftHandoverBoard';
import { ShiftNotesBoard } from '@/components/ShiftNotesBoard';
import { ComplaintsBoard } from '@/components/ComplaintsBoard';
import { LoansBoard } from '@/components/LoansBoard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

type PanelView = 'home' | 'todo' | 'notes' | 'complaints' | 'loans';

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
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition hover:bg-sidebar-hover hover:text-white"
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
  onBack,
  showBack,
}: {
  onSettings: () => void;
  onCollapse: () => void;
  onLogout: () => void;
  onBack?: () => void;
  showBack?: boolean;
}) {
  const { user } = useAuth();

  return (
    <header className="flex shrink-0 items-center justify-between gap-1.5 border-b border-sidebar-border bg-sidebar px-2.5 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {showBack && onBack && (
          <IconButton label="Zurück" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <BrandLogo compact onDark />
          {user && (
            <p className="mt-0.5 truncate text-[10px] text-sidebar-muted" title={user.email}>
              {user.name}
            </p>
          )}
        </div>
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

function CategoryTile({
  title,
  hint,
  onClick,
  disabled,
}: {
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        disabled
          ? 'rounded-lg border border-border/40 bg-surface-muted/40 px-3 py-3 text-left opacity-50'
          : 'rounded-lg border border-border bg-surface px-3 py-3 text-left shadow-sm transition hover:border-action/40 hover:bg-action/5'
      }
    >
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-[10px] text-ink-muted">{hint}</p>
    </button>
  );
}

function CategoryHome({ onOpen }: { onOpen: (v: Exclude<PanelView, 'home'>) => void }) {
  const canTodo = usePermission('SHIFT_HANDOVER_READ');
  const canNotes = usePermission('SHIFT_NOTES_READ');
  const canComplaints = usePermission('COMPLAINTS_READ');
  const canLoans = usePermission('LOANS_READ');

  const any = canTodo || canNotes || canComplaints || canLoans;

  if (!any) {
    return (
      <div className="p-3">
        <p className="text-xs text-ink-muted">Keine Berechtigung für Panel-Kategorien.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2 p-2.5">
      <CategoryTile
        title="To-Do-Liste"
        hint={canTodo ? 'Schicht-Checkliste' : 'Keine Berechtigung'}
        disabled={!canTodo}
        onClick={() => onOpen('todo')}
      />
      <CategoryTile
        title="Schichtübergabe"
        hint={canNotes ? 'Notizbuch' : 'Keine Berechtigung'}
        disabled={!canNotes}
        onClick={() => onOpen('notes')}
      />
      <CategoryTile
        title="Beschwerden"
        hint={canComplaints ? 'Gästebeschwerden' : 'Keine Berechtigung'}
        disabled={!canComplaints}
        onClick={() => onOpen('complaints')}
      />
      <CategoryTile
        title="Leihartikel"
        hint={canLoans ? 'Ausleihen & Pfand' : 'Keine Berechtigung'}
        disabled={!canLoans}
        onClick={() => onOpen('loans')}
      />
    </div>
  );
}

function PanelBody({
  view,
  onOpen,
}: {
  view: PanelView;
  onOpen: (v: Exclude<PanelView, 'home'>) => void;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p className="p-3 text-xs text-ink-muted">Wird geladen…</p>;
  }

  if (!user) {
    return <LoginForm />;
  }

  if (view === 'home') return <CategoryHome onOpen={onOpen} />;
  if (view === 'todo') return <ShiftHandoverBoard />;
  if (view === 'notes') return <ShiftNotesBoard />;
  if (view === 'complaints') return <ComplaintsBoard />;
  return <LoansBoard />;
}

function AppInner() {
  const { logout, user, loading } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [view, setView] = useState<PanelView>('home');
  const isLogin = !loading && !user;

  function collapsePanel() {
    window.parent.postMessage({ type: PANEL_MESSAGE.toggle }, '*');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar text-[13px]">
      <PanelHeader
        onSettings={() => setSettingsOpen(true)}
        onCollapse={collapsePanel}
        onLogout={logout}
        showBack={Boolean(user) && view !== 'home'}
        onBack={() => setView('home')}
      />
      <main className={`min-h-0 flex-1 overflow-y-auto ${isLogin ? 'bg-sidebar' : 'bg-surface-muted'}`}>
        <PanelBody view={user ? view : 'home'} onOpen={setView} />
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
