import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/i18n';
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
  const { m } = useI18n();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      setErr(ex instanceof Error ? ex.message : m.bernticket.twoFaError);
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/55 p-2" role="dialog" aria-modal>
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full rounded-2xl border border-white/10 bg-sidebar p-3 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xs font-semibold text-white">{m.bernticket.twoFaTitle}</h3>
        <p className="mt-1 text-[10px] text-sidebar-muted">{m.bernticket.twoFaDescription}</p>
        <input
          className={clsx(inputClass, 'mt-2 w-full')}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={m.bernticket.twoFaCodePlaceholder}
          autoFocus
        />
        {err && <p className="mt-1.5 text-[11px] text-rose-300">{err}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <Button type="button" variant="secondary" className="min-h-[28px] px-2" onClick={onClose}>
            {m.common.cancel}
          </Button>
          <Button type="submit" variant="action" className="min-h-[28px] px-2" disabled={pending || !code.trim()}>
            {m.bernticket.twoFaConfirm}
          </Button>
        </div>
      </form>
    </div>
  );
}

function LoginBlock({ onLoggedIn }: { onLoggedIn: (u: BtUser) => void }) {
  const { m } = useI18n();
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
      setErr(ex instanceof Error ? ex.message : m.bernticket.loginError);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-2 p-2.5">
      <p className="text-[10px] text-sidebar-muted">{m.bernticket.loginHint}</p>
      <Field label={m.bernticket.email}>
        <input
          className={inputClass}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label={m.bernticket.password}>
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
        {pending ? m.bernticket.loginPending : m.bernticket.loginSubmit}
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
  const { m } = useI18n();
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
      <Field label={m.bernticket.guestName}>
        <input className={inputClass} value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
      </Field>
      <Field label={m.bernticket.bookingNumber}>
        <input className={inputClass} value={bookingNumber} onChange={(e) => setBookingNumber(e.target.value)} />
      </Field>
      <Field label={m.bernticket.otaNumber}>
        <input className={inputClass} value={otaNumber} onChange={(e) => setOtaNumber(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label={m.bernticket.validFrom}>
          <input
            className={inputClass}
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            required
          />
        </Field>
        <Field label={m.bernticket.validTo}>
          <input
            className={inputClass}
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            required
          />
        </Field>
      </div>
      <Field label={m.bernticket.ticketsAmount}>
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
          {m.common.cancel}
        </Button>
        <Button
          type="submit"
          variant="action"
          className="min-h-[30px] flex-1"
          disabled={pending || !guestName.trim() || (!bookingNumber.trim() && !otaNumber.trim())}
        >
          {pending ? m.common.ellipsis : submitLabel}
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
  const { m } = useI18n();
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
          title={m.bernticket.copyCode}
        >
          {copied ? m.bernticket.copied : code}
        </button>
      ) : (
        <p className="mt-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-center text-[10px] text-sidebar-muted">
          {m.bernticket.noActivationCode}
        </p>
      )}
      <p className="mt-1.5 text-[9px] text-sidebar-muted">
        {toDateInputValue(ticket.validFrom)} → {toDateInputValue(ticket.validTo)}
      </p>
      <div className="mt-2 flex gap-1.5">
        <Button type="button" variant="secondary" className="min-h-[26px] flex-1 text-[10px]" onClick={onEdit}>
          {m.bernticket.edit}
        </Button>
        {ticket.status !== 'INVALIDATED' && (
          <Button
            type="button"
            variant="danger"
            className="min-h-[26px] flex-1 text-[10px]"
            disabled={invalidating}
            onClick={onInvalidate}
          >
            {m.bernticket.invalidate}
          </Button>
        )}
      </div>
    </li>
  );
}

export function BernTicketBoard() {
  const { m } = useI18n();
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
      setFormError(e instanceof Error ? e.message : m.bernticket.createError);
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
      setFormError(e instanceof Error ? e.message : m.bernticket.saveError);
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
    return <p className="p-3 text-[11px] text-sidebar-muted">{m.common.loading}</p>;
  }

  if (!user) {
    return <LoginBlock onLoggedIn={setUser} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-white">{m.bernticket.title}</p>
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
          {m.bernticket.logout}
        </Button>
      </header>

      {mode === 'create' && (
        <TicketForm
          submitLabel={m.bernticket.create}
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
          submitLabel={m.bernticket.save}
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
                placeholder={m.bernticket.searchPlaceholder}
              />
              <Button type="submit" variant="action" className="min-h-[30px] px-2.5">
                {m.bernticket.search}
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
              {m.bernticket.newTicket}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
            {!query && (
              <p className="py-4 text-center text-[11px] text-sidebar-muted">{m.bernticket.emptyHint}</p>
            )}
            {query && listQ.isLoading && (
              <p className="py-4 text-center text-[11px] text-sidebar-muted">{m.bernticket.searching}</p>
            )}
            {query && listQ.isError && (
              <p className="py-4 text-center text-[11px] text-rose-300">
                {(listQ.error as Error).message || m.bernticket.searchError}
              </p>
            )}
            {query && !listQ.isLoading && tickets.length === 0 && (
              <div className="space-y-2 py-4 text-center">
                <p className="text-[11px] text-sidebar-muted">{m.bernticket.notFound}</p>
                <Button
                  type="button"
                  variant="action"
                  className="min-h-[28px] text-[10px]"
                  onClick={() => {
                    setMode('create');
                    setFormError(null);
                  }}
                >
                  {m.bernticket.createTicket}
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
