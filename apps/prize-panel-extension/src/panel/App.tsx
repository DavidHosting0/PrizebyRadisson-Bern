import { useState, useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import type {
  GuestComplaintDto,
  RoomLoanDto,
  ShiftHandoverStateDto,
  ShiftNoteDto,
} from '@housekeeping/shared';
import { AuthProvider, useAuth, usePermission } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { PANEL_MESSAGE } from '@/lib/storage';
import { BrandLogo } from '@/components/BrandLogo';
import { Avatar } from '@/components/Avatar';
import { LoginForm } from '@/components/LoginForm';
import { SettingsDialog } from '@/components/SettingsDialog';
import { ShiftHandoverBoard } from '@/components/ShiftHandoverBoard';
import { ShiftNotesBoard } from '@/components/ShiftNotesBoard';
import { ComplaintsBoard } from '@/components/ComplaintsBoard';
import { LoansBoard } from '@/components/LoansBoard';
import { TeamChatBoard } from '@/components/TeamChatBoard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

type PanelView = 'home' | 'todo' | 'notes' | 'complaints' | 'loans' | 'chat';

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
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-2.5 py-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showBack && onBack && (
          <IconButton label="Zurück" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        )}
        {user ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar name={user.name} url={user.avatarUrl} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-white" title={user.name}>
                {user.name}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-sidebar-muted" title={user.email}>
                {user.email}
              </p>
            </div>
          </div>
        ) : (
          <BrandLogo compact onDark />
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

function CategoryIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white/15 to-white/5 text-white shadow-inner ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}

function CategoryTile({
  title,
  info,
  onClick,
  disabled,
  icon,
}: {
  title: string;
  info: string;
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition duration-tap',
        disabled
          ? 'cursor-not-allowed bg-white/[0.03] opacity-40'
          : 'bg-white/[0.06] ring-1 ring-inset ring-white/10 hover:bg-white/[0.11] hover:ring-white/20 active:scale-[0.98]',
      )}
    >
      <CategoryIcon>{icon}</CategoryIcon>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold tracking-tight text-white">{title}</span>
        <span
          className={clsx(
            'mt-0.5 block truncate text-[11px] font-medium',
            disabled ? 'text-sidebar-muted' : 'text-sky-200/90',
          )}
        >
          {info}
        </span>
      </span>
      {!disabled && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-sidebar-muted transition group-hover:translate-x-0.5 group-hover:text-white"
          aria-hidden
        >
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function calendarTodayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoDateLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function CategoryHome({ onOpen }: { onOpen: (v: Exclude<PanelView, 'home'>) => void }) {
  const canTodo = usePermission('SHIFT_HANDOVER_READ');
  const canNotes = usePermission('SHIFT_NOTES_READ');
  const canComplaints = usePermission('COMPLAINTS_READ');
  const canLoans = usePermission('LOANS_READ');
  const canChat = usePermission('TEAM_CHAT_READ');
  const calendarToday = calendarTodayIso();

  const any = canTodo || canNotes || canComplaints || canLoans || canChat;

  const handoverQ = useQuery({
    queryKey: ['shift-handover'],
    queryFn: () => api<ShiftHandoverStateDto>('/shift-handover'),
    enabled: canTodo || canNotes,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const operatingDay = handoverQ.data?.activeDate ?? calendarToday;

  const notesQ = useQuery({
    queryKey: ['shift-notes', 'day', operatingDay],
    queryFn: () => api<ShiftNoteDto[]>(`/shift-notes?date=${operatingDay}`),
    enabled: canNotes && Boolean(operatingDay),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const complaintsQ = useQuery({
    queryKey: ['complaints', 'all-for-stats'],
    queryFn: () => api<GuestComplaintDto[]>('/complaints'),
    enabled: canComplaints,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const loansQ = useQuery({
    queryKey: ['loans', 'all-for-stats'],
    queryFn: () => api<RoomLoanDto[]>('/loans'),
    enabled: canLoans,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const chatQ = useQuery({
    queryKey: ['team-chat-messages', 'stats'],
    queryFn: () => api<{ createdAt: string }[]>('/team-chat/messages?limit=200'),
    enabled: canChat,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const todoInfo = useMemo(() => {
    if (!canTodo) return 'Keine Berechtigung';
    const data = handoverQ.data;
    if (handoverQ.isLoading || !data) return 'Laden…';
    const open = data.totalCount - data.completedCount;
    if (data.totalCount === 0) return 'Keine Aufgaben';
    if (open === 0) return `Alles erledigt · ${data.activeShiftLabel}`;
    return `${open} offen · ${data.activeShiftLabel}`;
  }, [canTodo, handoverQ.data, handoverQ.isLoading]);

  const notesInfo = useMemo(() => {
    if (!canNotes) return 'Keine Berechtigung';
    if (notesQ.isLoading || handoverQ.isLoading) return 'Laden…';
    const list = notesQ.data ?? [];
    const open = list.filter((n) => !n.completed).length;
    if (list.length === 0) return 'Keine Notizen heute';
    if (open === 0) return `Alles erledigt · ${list.length}`;
    return open === 1 ? '1 offen' : `${open} offen`;
  }, [canNotes, notesQ.data, notesQ.isLoading, handoverQ.isLoading]);

  const complaintsInfo = useMemo(() => {
    if (!canComplaints) return 'Keine Berechtigung';
    if (complaintsQ.isLoading) return 'Laden…';
    const n = (complaintsQ.data ?? []).filter((c) => isoDateLocal(c.createdAt) === calendarToday)
      .length;
    if (n === 0) return 'Keine Beschwerden heute';
    return n === 1 ? '1 Beschwerde heute' : `${n} Beschwerden heute`;
  }, [canComplaints, complaintsQ.data, complaintsQ.isLoading, calendarToday]);

  const loansInfo = useMemo(() => {
    if (!canLoans) return 'Keine Berechtigung';
    if (loansQ.isLoading) return 'Laden…';
    const n = (loansQ.data ?? []).filter((l) => isoDateLocal(l.loanedAt) === calendarToday).length;
    if (n === 0) return 'Keine Ausleihen heute';
    return n === 1 ? '1 Ausleihe heute' : `${n} Ausleihen heute`;
  }, [canLoans, loansQ.data, loansQ.isLoading, calendarToday]);

  const chatInfo = useMemo(() => {
    if (!canChat) return 'Keine Berechtigung';
    if (chatQ.isLoading) return 'Laden…';
    const n = (chatQ.data ?? []).filter((m) => isoDateLocal(m.createdAt) === calendarToday).length;
    if (n === 0) return 'Keine Nachrichten heute';
    return n === 1 ? '1 Nachricht heute' : `${n} Nachrichten heute`;
  }, [canChat, chatQ.data, chatQ.isLoading, calendarToday]);

  if (!any) {
    return (
      <div className="flex h-full items-center justify-center bg-sidebar p-4">
        <p className="text-center text-xs text-sidebar-muted">Keine Berechtigung für Panel-Kategorien.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="border-b border-sidebar-border/80 px-3 py-2.5">
        <BrandLogo compact onDark className="opacity-90" />
        <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-muted">
          Kategorien
        </p>
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        <CategoryTile
          title="Chat"
          info={chatInfo}
          disabled={!canChat}
          onClick={() => onOpen('chat')}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        />
        <CategoryTile
          title="To-Do-Liste"
          info={todoInfo}
          disabled={!canTodo}
          onClick={() => onOpen('todo')}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <CategoryTile
          title="Schichtübergabe"
          info={notesInfo}
          disabled={!canNotes}
          onClick={() => onOpen('notes')}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <CategoryTile
          title="Beschwerden"
          info={complaintsInfo}
          disabled={!canComplaints}
          onClick={() => onOpen('complaints')}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
        <CategoryTile
          title="Leihartikel"
          info={loansInfo}
          disabled={!canLoans}
          onClick={() => onOpen('loans')}
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        />
      </div>
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
    return <p className="bg-sidebar p-3 text-xs text-sidebar-muted">Wird geladen…</p>;
  }

  if (!user) {
    return <LoginForm />;
  }

  if (view === 'home') return <CategoryHome onOpen={onOpen} />;
  if (view === 'chat') return <TeamChatBoard />;
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
  const fillHeight = view === 'home' || view === 'todo' || view === 'notes' || view === 'chat';

  function collapsePanel() {
    window.parent.postMessage({ type: PANEL_MESSAGE.toggle }, '*');
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar text-[13px] text-slate-100">
      <PanelHeader
        onSettings={() => setSettingsOpen(true)}
        onCollapse={collapsePanel}
        onLogout={logout}
        showBack={Boolean(user) && view !== 'home'}
        onBack={() => setView('home')}
      />
      <main
        className={clsx(
          'min-h-0 flex-1 bg-sidebar',
          isLogin || !fillHeight ? 'overflow-y-auto' : 'overflow-hidden',
        )}
      >
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
