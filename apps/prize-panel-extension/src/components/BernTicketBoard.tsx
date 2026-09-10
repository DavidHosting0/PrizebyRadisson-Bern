import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import {
  BERN_TICKET_2FA_REQUIRED,
  BtApiError,
  type BtTicket,
  type BtTicketCreateBody,
  type BtUser,
  btComplete2fa,
  btCreateTicket,
  btInvalidateTicket,
  btLogin,
  btLogout,
  btMe,
  btSearchTickets,
  btUpdateTicket,
  getActivationCode,
  getBtRememberEmail,
  getBtTokens,
  toDateInputValue,
} from '@/lib/bernticket-api';

type Mode = 'list' | 'create' | 'edit';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-sidebar-muted">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'min-h-[30px] rounded-lg border border-white/15 bg-white/5 px-2 text-[11px] text-white placeholder:text-sidebar-muted/70';

function TwoFaPrompt({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      await btComplete2fa(code);
      await onDone();
      setCode('');
      onClose();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '2FA fehlgeschlagen');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/55 p-2" role="dialog" aria-modal>
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full rounded-2xl border border-white/10 bg-sidebar p-3 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xs font-semibold text-white">BernTicket 2FA</h3>
        <p className="mt-1 text-[10px] text-sidebar-muted">
          Puma verlangt einen Bestätigungscode (oft an bern-city@prizebyradisson.com).
        </p>
        <input
          className={clsx(inputClass, 'mt-2 w-full')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code"
          autoFocus
        />
        {err && <p className="mt-1.5 text-[11px] text-rose-300">{err}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <Button type="button" variant="secondary" className="min-h-[28px] px-2" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="action" className="min-h-[28px] px-2" disabled={pending || !code.trim()}>
            Bestätigen
          </Button>
        </div>
      </form>
    </div>
  );
}

function LoginBlock({ onLoggedIn }: { onLoggedIn: (u: BtUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getBtRememberEmail().then((e) => {
      if (e) setEmail(e);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    try {
      const user = await btLogin(email, password);
      onLoggedIn(user);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Login fehlgeschlagen');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-2 p-2.5">
      <p className="text-[10px] text-sidebar-muted">
        Mit deinem BernTicket-Konto anmelden (bernticket.com — getrennt von PrizeBern).
      </p>
      <Field label="E-Mail">
        <input
          className={inputClass}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Passwort">
        <input
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {err && <p className="text-[11px] text-rose-300">{err}</p>}
      <Button type="submit" variant="action" fullWidth className="min-h-[32px]" disabled={pending}>
        {pending ? 'Anmelden…' : 'Bei BernTicket anmelden'}
      </Button>
    </form>
  );
}

function TicketForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<BtTicketCreateBody>;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (body: BtTicketCreateBody) => void;
  onCancel: () => void;
}) {
  const [guestName, setGuestName] = useState(initial?.guestName ?? '');
  const [bookingNumber, setBookingNumber] = useState(initial?.bookingNumber ?? '');
  const [otaNumber, setOtaNumber] = useState(initial?.otaNumber ?? '');
  const [validFrom, setValidFrom] = useState(initial?.validFrom ? toDateInputValue(initial.validFrom) : todayIso());
  const [validTo, setValidTo] = useState(initial?.validTo ? toDateInputValue(initial.validTo) : tomorrowIso());
  const [ticketsAmount, setTicketsAmount] = useState(String(initial?.ticketsAmount ?? 1));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bookingNumber.trim() && !otaNumber.trim()) return;
    onSubmit({
      guestName: guestName.trim(),
      bookingNumber: bookingNumber.trim() || undefined,
      otaNumber: otaNumber.trim() || undefined,
      validFrom,
      validTo,
      ticketsAmount: Math.max(1, parseInt(ticketsAmount, 10) || 1),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 p-2.5">
      <Field label="Gastname">
        <input className={inputClass} value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
      </Field>
      <Field label="Buchungsnummer">
        <input className={inputClass} value={bookingNumber} onChange={(e) => setBookingNumber(e.target.value)} />
      </Field>
      <Field label="OTA-Nummer">
        <input className={inputClass} value={otaNumber} onChange={(e) => setOtaNumber(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Gültig ab">
          <input
            className={inputClass}
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            required
          />
        </Field>
        <Field label="Gültig bis">
          <input
            className={inputClass}
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            required
          />
        </Field>
      </div>
      <Field label="Anzahl Tickets">
        <input
          className={inputClass}
          type="number"
          min={1}
          value={ticketsAmount}
          onChange={(e) => setTicketsAmount(e.target.value)}
        />
      </Field>
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
      <div className="flex gap-1.5">
        <Button type="button" variant="secondary" className="min-h-[30px] flex-1" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          variant="action"
          className="min-h-[30px] flex-1"
          disabled={pending || !guestName.trim() || (!bookingNumber.trim() && !otaNumber.trim())}
        >
          {pending ? '…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function TicketCard({
  ticket,
  onEdit,
  onInvalidate,
  invalidating,
}: {
  ticket: BtTicket;
  onEdit: () => void;
  onInvalidate: () => void;
  invalidating: boolean;
}) {
  const code = getActivationCode(ticket);
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <li className="rounded-xl border border-white/10 bg-white/[0.05] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-white">{ticket.guestName}</p>
          <p className="mt-0.5 truncate text-[10px] text-sidebar-muted">
            {ticket.bookingNumber || ticket.otaNumber || '—'} · {ticket.status}
          </p>
        </div>
        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-slate-200">
          {ticket.ticketsAmount}×
        </span>
      </div>
      {code ? (
        <button
          type="button"
          onClick={() => void copyCode()}
          className="mt-2 w-full rounded-lg border border-rose-400/30 bg-rose-500/15 px-2 py-1.5 font-mono text-[13px] font-bold tracking-wide text-rose-100"
          title="Code kopieren"
        >
          {copied ? 'Kopiert' : code}
        </button>
      ) : (
        <p className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-[10px] text-sidebar-muted">
          Kein Aktivierungscode
        </p>
      )}
      <p className="mt-1.5 text-[9px] text-sidebar-muted">
        {toDateInputValue(ticket.validFrom)} → {toDateInputValue(ticket.validTo)}
      </p>
      <div className="mt-2 flex gap-1.5">
        <Button type="button" variant="secondary" className="min-h-[26px] flex-1 text-[10px]" onClick={onEdit}>
          Bearbeiten
        </Button>
        {ticket.status !== 'INVALIDATED' && (
          <Button
            type="button"
            variant="danger"
            className="min-h-[26px] flex-1 text-[10px]"
            disabled={invalidating}
            onClick={onInvalidate}
          >
            Invalidieren
          </Button>
        )}
      </div>
    </li>
  );
}

export function BernTicketBoard() {
  const qc = useQueryClient();
  const [user, setUser] = useState<BtUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>('list');
  const [editing, setEditing] = useState<BtTicket | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [show2fa, setShow2fa] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<null | (() => Promise<unknown>)>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tokens = await getBtTokens();
      if (!tokens.access) {
        if (!cancelled) {
          setUser(null);
          setAuthLoading(false);
        }
        return;
      }
      const me = await btMe();
      if (!cancelled) {
        setUser(me);
        setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const listQ = useQuery({
    queryKey: ['bt-tickets', query],
    queryFn: () => btSearchTickets(query),
    enabled: Boolean(user) && query.trim().length > 0,
  });

  const createMut = useMutation({
    mutationFn: btCreateTicket,
    onSuccess: () => {
      setMode('list');
      setFormError(null);
      qc.invalidateQueries({ queryKey: ['bt-tickets'] });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BtTicketCreateBody }) => btUpdateTicket(id, body),
    onSuccess: () => {
      setMode('list');
      setEditing(null);
      setFormError(null);
      qc.invalidateQueries({ queryKey: ['bt-tickets'] });
    },
  });

  const invalidateMut = useMutation({
    mutationFn: btInvalidateTicket,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bt-tickets'] }),
  });

  const tickets = useMemo(() => listQ.data ?? [], [listQ.data]);

  async function handleCreate(body: BtTicketCreateBody) {
    setFormError(null);
    try {
      await createMut.mutateAsync(body);
    } catch (e) {
      if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
        setPendingRetry(() => () => createMut.mutateAsync(body));
        setShow2fa(true);
        return;
      }
      setFormError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    }
  }

  async function handleUpdate(body: BtTicketCreateBody) {
    if (!editing) return;
    setFormError(null);
    try {
      await updateMut.mutateAsync({ id: editing.id, body });
    } catch (e) {
      if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
        setPendingRetry(() => () => updateMut.mutateAsync({ id: editing.id, body }));
        setShow2fa(true);
        return;
      }
      setFormError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  }

  async function handleInvalidate(id: string) {
    try {
      await invalidateMut.mutateAsync(id);
    } catch (e) {
      if (e instanceof BtApiError && e.code === BERN_TICKET_2FA_REQUIRED) {
        setPendingRetry(() => () => invalidateMut.mutateAsync(id));
        setShow2fa(true);
      }
    }
  }

  if (authLoading) {
    return <p className="p-3 text-[11px] text-sidebar-muted">Laden…</p>;
  }

  if (!user) {
    return <LoginBlock onLoggedIn={setUser} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-white">BernTicket</p>
          <p className="truncate text-[9px] text-sidebar-muted">{user.email}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="min-h-[26px] px-2 text-[10px]"
          onClick={() => {
            void btLogout().then(() => {
              setUser(null);
              setMode('list');
              setQuery('');
            });
          }}
        >
          Abmelden
        </Button>
      </header>

      {mode === 'create' && (
        <TicketForm
          submitLabel="Erstellen"
          pending={createMut.isPending}
          error={formError}
          onSubmit={(body) => void handleCreate(body)}
          onCancel={() => {
            setMode('list');
            setFormError(null);
          }}
        />
      )}

      {mode === 'edit' && editing && (
        <TicketForm
          initial={{
            guestName: editing.guestName,
            bookingNumber: editing.bookingNumber ?? undefined,
            otaNumber: editing.otaNumber ?? undefined,
            validFrom: editing.validFrom,
            validTo: editing.validTo,
            ticketsAmount: editing.ticketsAmount,
          }}
          submitLabel="Speichern"
          pending={updateMut.isPending}
          error={formError}
          onSubmit={(body) => void handleUpdate(body)}
          onCancel={() => {
            setMode('list');
            setEditing(null);
            setFormError(null);
          }}
        />
      )}

      {mode === 'list' && (
        <>
          <div className="shrink-0 space-y-1.5 border-b border-sidebar-border px-2.5 py-2">
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                setQuery(search.trim());
              }}
            >
              <input
                className={clsx(inputClass, 'min-w-0 flex-1')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buchungsnr., Gast, Code…"
              />
              <Button type="submit" variant="action" className="min-h-[30px] px-2.5">
                Suchen
              </Button>
            </form>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              className="min-h-[28px] text-[10px]"
              onClick={() => {
                setMode('create');
                setFormError(null);
              }}
            >
              + Neues Ticket
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
            {!query && (
              <p className="py-4 text-center text-[11px] text-sidebar-muted">
                Buchungsnummer suchen oder neues Ticket erstellen.
              </p>
            )}
            {query && listQ.isLoading && (
              <p className="py-4 text-center text-[11px] text-sidebar-muted">Suche…</p>
            )}
            {query && listQ.isError && (
              <p className="py-4 text-center text-[11px] text-rose-300">
                {(listQ.error as Error).message || 'Suche fehlgeschlagen'}
              </p>
            )}
            {query && !listQ.isLoading && tickets.length === 0 && (
              <div className="space-y-2 py-4 text-center">
                <p className="text-[11px] text-sidebar-muted">Kein Ticket gefunden.</p>
                <Button
                  type="button"
                  variant="action"
                  className="min-h-[28px] text-[10px]"
                  onClick={() => {
                    setMode('create');
                    setFormError(null);
                  }}
                >
                  Ticket erstellen
                </Button>
              </div>
            )}
            <ul className="flex flex-col gap-2">
              {tickets.map((t) => (
                <TicketCard
                  key={t.id}
                  ticket={t}
                  invalidating={invalidateMut.isPending}
                  onEdit={() => {
                    setEditing(t);
                    setMode('edit');
                    setFormError(null);
                  }}
                  onInvalidate={() => void handleInvalidate(t.id)}
                />
              ))}
            </ul>
          </div>
        </>
      )}

      <TwoFaPrompt
        open={show2fa}
        onClose={() => {
          setShow2fa(false);
          setPendingRetry(null);
        }}
        onDone={async () => {
          if (pendingRetry) await pendingRetry();
          setPendingRetry(null);
          setMode('list');
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['bt-tickets'] });
        }}
      />
    </div>
  );
}
