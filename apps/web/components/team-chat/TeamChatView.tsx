'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import clsx from 'clsx';
import { api, API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { NewRequestModal } from '@/components/reception/NewRequestModal';
import { PriorityBadge } from '@/components/PriorityBadge';
import { useToast } from '@/components/toast/ToastProvider';
import { userTitlePrefixLabel } from '@/lib/userTitlePrefix';

type ChatMsg = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; titlePrefix: string };
};

type ReqRow = {
  id: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
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

export function TeamChatView({
  className,
  embedOperationsSocket = true,
}: {
  className?: string;
  embedOperationsSocket?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState('');
  const [newReqOpen, setNewReqOpen] = useState(false);

  const { data: messages = [], isLoading: loadingMsg } = useQuery({
    queryKey: ['team-chat-messages'],
    queryFn: () => api<ChatMsg[]>('/team-chat/messages?limit=300'),
  });

  const { data: requests = [], isLoading: loadingReq } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<ReqRow[]>('/service-requests'),
  });

  const activeRequests = requests.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CANCELLED');

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
    const onReq = () => qc.invalidateQueries({ queryKey: ['service-requests'] });
    socket.on('team_chat.message', onChat);
    socket.on('service_request.created', onReq);
    socket.on('service_request.claimed', onReq);
    socket.on('service_request.resolved', onReq);
    socket.on('service_request.updated', onReq);
    return () => {
      socket?.off('team_chat.message', onChat);
      socket?.off('service_request.created', onReq);
      socket?.off('service_request.claimed', onReq);
      socket?.off('service_request.resolved', onReq);
      socket?.off('service_request.updated', onReq);
      socket?.disconnect();
    };
  }, [embedOperationsSocket, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (text: string) =>
      api('/team-chat/messages', { method: 'POST', body: JSON.stringify({ body: text }) }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    },
    onError: (e: unknown) => {
      toast.push(e instanceof Error ? e.message : 'Could not send message', 'warning');
    },
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
    if (!t || send.isPending) return;
    send.mutate(t);
  }

  const isHk = user?.role === 'HOUSEKEEPER';
  const canCreateRequest =
    user?.role === 'SUPERVISOR' || user?.role === 'RECEPTION' || user?.role === 'ADMIN';

  return (
    <div className={clsx('flex min-h-0 flex-1 flex-col', className)}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {loadingMsg && <p className="text-sm text-ink-muted">Loading messages…</p>}
        {!loadingMsg && messages.length === 0 && (
          <p className="text-sm text-ink-muted">No messages yet. Say hello to the team.</p>
        )}
        {messages.map((m) => {
          const mine = m.author.id === user?.id;
          return (
            <div key={m.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'max-w-[min(100%,28rem)] rounded-2xl border px-3 py-2 shadow-sm',
                  mine ? 'border-action/30 bg-action-muted text-ink' : 'border-border bg-surface text-ink',
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                  <span className="text-xs font-semibold text-ink">{m.author.name}</span>
                  <span className="text-[10px] font-medium tracking-wide text-ink-muted">
                    {userTitlePrefixLabel(m.author.titlePrefix)}
                  </span>
                  <span className="text-[10px] text-ink-muted/80">{formatTime(m.createdAt)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-snug">{m.body}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-surface-muted/50">
        <div className="border-b border-border/80 px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Live requests</p>
          {loadingReq && <p className="mt-1 text-xs text-ink-muted">Loading…</p>}
          {!loadingReq && activeRequests.length === 0 && (
            <p className="mt-1 text-xs text-ink-muted">No open requests.</p>
          )}
          <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
            {activeRequests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    Room {r.room.roomNumber} · {r.type.label}
                  </p>
                  <p className="text-xs text-ink-muted">{statusLine(r)}</p>
                  <div className="mt-1">
                    <PriorityBadge priority={r.priority} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {isHk && (r.status === 'OPEN' || r.status === 'CREATED') && (
                    <Button
                      type="button"
                      variant="action"
                      className="min-h-[36px] px-3 text-xs"
                      disabled={claim.isPending}
                      onClick={() => claim.mutate(r.id)}
                    >
                      Claim
                    </Button>
                  )}
                  {isHk &&
                    r.claimedBy?.id === user?.id &&
                    (r.status === 'CLAIMED' || r.status === 'IN_PROGRESS') && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-[36px] px-3 text-xs"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate(r.id)}
                      >
                        Mark done
                      </Button>
                    )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {canCreateRequest && (
          <div className="flex flex-wrap gap-2 border-b border-border/60 px-4 py-2">
            <Button type="button" variant="secondary" className="min-h-[40px] text-sm" onClick={() => setNewReqOpen(true)}>
              + New request
            </Button>
          </div>
        )}

        <form onSubmit={onSend} className="flex gap-2 p-3">
          <input
            className="min-h-[48px] flex-1 rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15"
            placeholder="Message the team…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            autoComplete="off"
          />
          <Button type="submit" variant="action" className="min-h-[48px] shrink-0 px-5" disabled={send.isPending || !body.trim()}>
            Send
          </Button>
        </form>
      </div>

      {canCreateRequest && <NewRequestModal open={newReqOpen} onClose={() => setNewReqOpen(false)} />}
    </div>
  );
}
