'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import clsx from 'clsx';
import { api, API_BASE } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { NewRequestModal } from '@/components/reception/NewRequestModal';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useToast } from '@/components/toast/ToastProvider';
import { userTitlePrefixLabel } from '@/lib/userTitlePrefix';

const REACTION_TYPES = [
  { type: 'THUMBS_UP', emoji: '👍', label: 'Thumbs up' },
  { type: 'CHECK_MARK', emoji: '✅', label: 'Correct' },
  { type: 'HEART', emoji: '❤️', label: 'Heart' },
  { type: 'EYES', emoji: '👀', label: 'Eyes' },
  { type: 'EXCLAMATION_QUESTION', emoji: '⁉️', label: 'Exclamation question mark' },
] as const;

type ReactionSummary = { type: string; count: number; me: boolean };

type ChatMsg = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; titlePrefix: string };
  replyTo: {
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string; titlePrefix: string };
  } | null;
  reactions: ReactionSummary[];
};

type ReqRow = {
  id: string;
  createdAt: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

type ReplyTarget = {
  id: string;
  body: string;
  author: { id: string; name: string; titlePrefix: string };
};

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusLine(r: ReqRow): string {
  const s = r.status;
  if (s === 'OPEN' || s === 'CREATED') return 'Open — not claimed yet';
  if (s === 'CLAIMED') {
    return r.claimedBy ? `Claimed by ${userTitlePrefixLabel(r.claimedBy.titlePrefix)} · ${r.claimedBy.name}` : 'Claimed';
  }
  if (s === 'IN_PROGRESS') {
    return r.claimedBy
      ? `In progress · ${userTitlePrefixLabel(r.claimedBy.titlePrefix)} · ${r.claimedBy.name}`
      : 'In progress';
  }
  if (s === 'RESOLVED') return 'Done';
  if (s === 'CANCELLED') return 'Cancelled';
  return s.replace(/_/g, ' ');
}

function truncateBody(s: string, max = 100) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function TeamChatView({
  className,
  embedOperationsSocket = true,
}: {
  className?: string;
  embedOperationsSocket?: boolean;
}) {
  const { user } = useAuth();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');
  const canPost = usePermission('TEAM_CHAT_POST');
  const qc = useQueryClient();
  const toast = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [newReqOpen, setNewReqOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchMsgId = useRef<string | null>(null);

  const { data: messages = [], isLoading: loadingMsg } = useQuery({
    queryKey: ['team-chat-messages'],
    queryFn: () => api<ChatMsg[]>('/team-chat/messages?limit=300'),
  });

  const { data: requests = [], isLoading: loadingReq } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<ReqRow[]>('/service-requests'),
  });

  const timeline = useMemo(() => {
    const m = messages.map((msg) => ({
      kind: 'msg' as const,
      at: msg.createdAt,
      key: `m-${msg.id}`,
      msg,
    }));
    const r = requests.map((req) => ({
      kind: 'req' as const,
      at: req.createdAt,
      key: `r-${req.id}`,
      req,
    }));
    return [...m, ...r].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [messages, requests]);

  useEffect(() => {
    if (!embedOperationsSocket) return;
    const origin = API_BASE.replace(/\/api\/v1\/?$/, '');
    let socket: ReturnType<typeof io> | undefined;
    try {
      socket = io(`${origin}/operations`, { transports: ['websocket'] });
    } catch {
      return undefined;
    }
    const onChat = () => qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    const onReact = () => qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    const onReq = () => qc.invalidateQueries({ queryKey: ['service-requests'] });
    socket.on('team_chat.message', onChat);
    socket.on('team_chat.reaction', onReact);
    socket.on('service_request.created', onReq);
    socket.on('service_request.claimed', onReq);
    socket.on('service_request.resolved', onReq);
    socket.on('service_request.updated', onReq);
    return () => {
      socket?.off('team_chat.message', onChat);
      socket?.off('team_chat.reaction', onReact);
      socket?.off('service_request.created', onReq);
      socket?.off('service_request.claimed', onReq);
      socket?.off('service_request.resolved', onReq);
      socket?.off('service_request.updated', onReq);
      socket?.disconnect();
    };
  }, [embedOperationsSocket, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [timeline.length]);

  useEffect(() => {
    function onDocDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest?.('[data-chat-reaction-picker]')) {
        setPickerFor(null);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, []);

  const send = useMutation({
    mutationFn: (payload: { text: string; replyToId?: string }) =>
      api('/team-chat/messages', {
        method: 'POST',
        body: JSON.stringify({ body: payload.text, replyToId: payload.replyToId }),
      }),
    onSuccess: () => {
      setBody('');
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    },
    onError: (e: unknown) => {
      toast.push(e instanceof Error ? e.message : 'Could not send message', 'warning');
    },
  });

  const toggleReaction = useMutation({
    mutationFn: ({ messageId, type }: { messageId: string; type: string }) =>
      api(`/team-chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-chat-messages'] }),
  });

  const claim = useMutation({
    mutationFn: (id: string) => api<ReqRow>(`/service-requests/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  const resolve = useMutation({
    mutationFn: (id: string) =>
      api<ReqRow>(`/service-requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });

  function onSend(e: FormEvent) {
    e.preventDefault();
    const t = body.trim();
    if (!t || send.isPending || !canPost) return;
    send.mutate({ text: t, replyToId: replyTo?.id });
  }

  const startReply = useCallback((m: ChatMsg) => {
    setReplyTo({ id: m.id, body: m.body, author: m.author });
    setPickerFor(null);
  }, []);

  const onMsgTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchMsgId.current = id;
  }, []);

  const onMsgTouchEnd = useCallback(
    (e: React.TouchEvent, m: ChatMsg) => {
      if (touchMsgId.current !== m.id || touchStartX.current == null || touchStartY.current == null) {
        touchStartX.current = null;
        touchMsgId.current = null;
        return;
      }
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      if (dx > 64 && dy < 55) {
        startReply(m);
      }
      touchStartX.current = null;
      touchStartY.current = null;
      touchMsgId.current = null;
    },
    [startReply],
  );

  const isHk = user?.role === 'HOUSEKEEPER';

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col', className)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {(loadingMsg || loadingReq) && <p className="text-sm text-ink-muted">Loading…</p>}
        {!loadingMsg && !loadingReq && timeline.length === 0 && (
          <p className="text-sm text-ink-muted">No messages or requests yet.</p>
        )}
        <ul className="flex w-full max-w-full flex-col gap-4">
          {timeline.map((item) => {
            if (item.kind === 'req') {
              const r = item.req;
              const active = r.status !== 'RESOLVED' && r.status !== 'CANCELLED';
              return (
                <li key={item.key} className="w-full max-w-full">
                  <div
                    className={clsx(
                      'w-full max-w-full rounded-2xl border px-4 py-3 shadow-sm',
                      active
                        ? 'border-amber-500/35 bg-amber-50/90'
                        : 'border-border/80 bg-surface-muted/60 text-ink-muted',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Service request</p>
                        <p className="mt-1 text-base font-semibold text-ink">
                          Room {r.room.roomNumber}
                          <span className="font-normal text-ink-muted"> · {r.type.label}</span>
                        </p>
                        <p className="mt-1 text-sm text-ink-muted">{statusLine(r)}</p>
                        <div className="mt-2">
                          <PriorityBadge priority={r.priority} />
                        </div>
                        <p className="mt-2 text-[10px] text-ink-muted/80">{formatTime(r.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isHk && active && (r.status === 'OPEN' || r.status === 'CREATED') && (
                          <Button
                            type="button"
                            variant="action"
                            className="min-h-[40px] px-3 text-xs"
                            disabled={claim.isPending}
                            onClick={() => claim.mutate(r.id)}
                          >
                            Claim
                          </Button>
                        )}
                        {isHk &&
                          active &&
                          r.claimedBy?.id === user?.id &&
                          (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS') && (
                            <Button
                              type="button"
                              variant="secondary"
                              className="min-h-[40px] px-3 text-xs"
                              disabled={resolve.isPending}
                              onClick={() => resolve.mutate(r.id)}
                            >
                              Mark done
                            </Button>
                          )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            }

            const m = item.msg;
            const mine = m.author.id === user?.id;
            return (
              <li key={item.key} className="w-full max-w-full">
                <div
                  className="group relative flex w-full max-w-full touch-pan-y gap-1 sm:gap-2"
                  onTouchStart={(e) => onMsgTouchStart(e, m.id)}
                  onTouchEnd={(e) => onMsgTouchEnd(e, m)}
                >
                  <div className="hidden w-14 shrink-0 lg:block">
                    <button
                      type="button"
                      title="Reply"
                      aria-label="Reply to message"
                      onClick={() => startReply(m)}
                      className="mt-1 flex w-full flex-col items-center gap-0.5 rounded-lg border border-transparent py-1 text-[10px] font-medium text-ink-muted opacity-0 transition-opacity hover:border-border hover:bg-surface-muted hover:text-ink group-hover:opacity-100"
                    >
                      <span className="text-base leading-none" aria-hidden>
                        ↩
                      </span>
                      <span>Reply</span>
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className={clsx(
                        'w-full max-w-full rounded-2xl border px-4 py-3 shadow-sm',
                        mine ? 'border-action/30 bg-action-muted text-ink' : 'border-border bg-surface text-ink',
                      )}
                    >
                      {m.replyTo != null && (
                        <div
                          className={clsx(
                            'mb-2 rounded-lg border-l-4 px-2 py-1.5 text-xs',
                            mine ? 'border-ink/25 bg-ink/5' : 'border-action/40 bg-action-muted/40',
                          )}
                        >
                          <span className="font-semibold text-ink">{m.replyTo.author.name}</span>
                          <span className="text-ink-muted"> · </span>
                          <span className="text-ink-muted">{truncateBody(m.replyTo.body, 120)}</span>
                        </div>
                      )}
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                        <span className="text-xs font-semibold text-ink">{m.author.name}</span>
                        <span className="text-[10px] font-medium tracking-wide text-ink-muted">
                          {userTitlePrefixLabel(m.author.titlePrefix)}
                        </span>
                        <span className="text-[10px] text-ink-muted/80">{formatTime(m.createdAt)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-0.5" data-chat-reaction-picker>
                      {(m.reactions ?? []).map((rx) => {
                        const def = REACTION_TYPES.find((t) => t.type === rx.type);
                        if (!def) return null;
                        return (
                          <button
                            key={rx.type}
                            type="button"
                            title={def.label}
                            disabled={!canPost || toggleReaction.isPending}
                            onClick={() => toggleReaction.mutate({ messageId: m.id, type: rx.type })}
                            className={clsx(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                              rx.me
                                ? 'border-action/50 bg-action-muted font-medium'
                                : 'border-border bg-surface-muted/80 text-ink-muted hover:border-border hover:bg-surface-muted',
                            )}
                          >
                            <span>{def.emoji}</span>
                            <span className="tabular-nums">{rx.count}</span>
                          </button>
                        );
                      })}
                      {canPost && (
                        <button
                          type="button"
                          title="Add reaction"
                          aria-label="Add reaction"
                          onClick={() => setPickerFor((id) => (id === m.id ? null : m.id))}
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-ink-muted/40 text-ink-muted transition-colors hover:border-action/40 hover:bg-surface-muted hover:text-ink"
                        >
                          <span className="text-sm leading-none">＋</span>
                        </button>
                      )}
                    </div>

                    {pickerFor === m.id && canPost && (
                      <div
                        className="mt-2 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-2 shadow-card"
                        data-chat-reaction-picker
                      >
                        {REACTION_TYPES.map((rt) => (
                          <button
                            key={rt.type}
                            type="button"
                            title={rt.label}
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-xl hover:bg-surface-muted"
                            onClick={() => {
                              toggleReaction.mutate({ messageId: m.id, type: rt.type });
                              setPickerFor(null);
                            }}
                          >
                            {rt.emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      {canCreateRequest && (
        <div className="border-t border-border/60 bg-surface-muted/30 px-3 py-2">
          <Button type="button" variant="secondary" className="min-h-[44px] w-full text-sm" onClick={() => setNewReqOpen(true)}>
            + New request
          </Button>
        </div>
      )}

      {canPost && (
        <form onSubmit={onSend} className="border-t border-border bg-surface-muted/50">
          {replyTo && (
            <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-action-muted/30 px-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="font-semibold text-ink">Replying to {replyTo.author.name}</span>
                <p className="mt-0.5 truncate text-ink-muted">{truncateBody(replyTo.body, 160)}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-md px-2 py-1 font-medium text-ink-muted hover:bg-surface hover:text-ink"
                onClick={() => setReplyTo(null)}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex gap-2 p-3">
            <input
              className="min-h-[48px] flex-1 rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
              placeholder={replyTo ? 'Write a reply…' : 'Message the team…'}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              autoComplete="off"
            />
            <Button type="submit" variant="action" className="min-h-[48px] shrink-0 px-5" disabled={send.isPending || !body.trim()}>
              Send
            </Button>
          </div>
        </form>
      )}

      {canCreateRequest && <NewRequestModal open={newReqOpen} onClose={() => setNewReqOpen(false)} />}
    </div>
  );
}
