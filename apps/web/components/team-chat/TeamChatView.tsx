'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth, usePermission } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { NewRequestModal } from '@/components/reception/NewRequestModal';
import { PriorityBadge } from '@/components/PriorityBadge';
import { ProfilePhotoSheet } from '@/components/profile/ProfilePhotoSheet';
import { useToast } from '@/components/toast/ToastProvider';
import { userTitlePrefixLabel, formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { useDamageTypeLabel } from '@/lib/damageReportTypes';
import { MentionText } from '@/components/team-chat/MentionText';
import { MentionComposer } from '@/components/team-chat/MentionComposer';
import { useLocale } from '@/lib/locale-context';
import { useTranslations } from 'next-intl';

const REACTION_TYPES = [
  { type: 'THUMBS_UP', emoji: '👍', label: 'Thumbs up' },
  { type: 'CHECK_MARK', emoji: '✅', label: 'Correct' },
  { type: 'HEART', emoji: '❤️', label: 'Heart' },
  { type: 'EYES', emoji: '👀', label: 'Eyes' },
  { type: 'EXCLAMATION_QUESTION', emoji: '⁉️', label: 'Exclamation question mark' },
] as const;

const NEAR_BOTTOM_THRESHOLD_PX = 80;

type ReactionSummary = { type: string; count: number; me: boolean };

type ChatAuthor = {
  id: string;
  name: string;
  titlePrefix: string;
  avatarUrl?: string | null;
};

type ChatMsg = {
  id: string;
  body: string;
  bodyTranslated?: string | null;
  sourceLocale?: string | null;
  isTranslated?: boolean;
  createdAt: string;
  author: ChatAuthor;
  replyTo: {
    id: string;
    body: string;
    bodyTranslated?: string | null;
    createdAt: string;
    author: ChatAuthor;
  } | null;
  reactions: ReactionSummary[];
  mentions?: ChatAuthor[];
};

function ChatMessageBody({
  msg,
  mine,
  mentions,
}: {
  msg: ChatMsg;
  mine: boolean;
  mentions?: ChatAuthor[];
}) {
  const t = useTranslations('chat');
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = !!msg.isTranslated && !!msg.bodyTranslated;
  const displayBody =
    hasTranslation && showOriginal ? msg.bodyTranslated! : msg.body;

  return (
    <>
      <MentionText body={displayBody} mentions={mentions} className="text-[14.5px] leading-snug" />
      {hasTranslation && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          className={clsx(
            'mt-1 text-[10px] font-medium underline-offset-2 hover:underline',
            mine ? 'text-ink/70' : 'text-action',
          )}
        >
          {showOriginal ? t('showTranslation') : t('showOriginal')}
        </button>
      )}
    </>
  );
}

type ReqRow = {
  id: string;
  createdAt: string;
  status: string;
  priority: string;
  room: { roomNumber: string };
  type: { label: string };
  claimedBy: { id: string; name: string; titlePrefix: string } | null;
};

type DmgRow = {
  id: string;
  reportedAt: string;
  status: string;
  damageType: string;
  description: string;
  photoUrl: string;
  room: { roomNumber: string };
  reportedBy: { name: string; titlePrefix: string };
};

type ReplyTarget = {
  id: string;
  body: string;
  author: ChatAuthor;
};

/* ---------- helpers ---------- */

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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

function damageStatusLine(d: DmgRow): string {
  const s = d.status;
  if (s === 'REPORTED') return 'Reported — awaiting review';
  if (s === 'ACKNOWLEDGED') return 'Acknowledged';
  if (s === 'RESOLVED') return 'Resolved';
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const DAMAGE_STATUSES = ['REPORTED', 'ACKNOWLEDGED', 'RESOLVED'] as const;

function truncateBody(s: string, max = 100) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

type MsgItem = { kind: 'msg'; at: string; key: string; msg: ChatMsg };
type ReqItem = { kind: 'req'; at: string; key: string; req: ReqRow };
type DmgItem = { kind: 'dmg'; at: string; key: string; dmg: DmgRow };
type DayItem = { kind: 'day'; at: string; key: string; label: string };
type TimelineItem = MsgItem | ReqItem | DmgItem | DayItem;

/** Group-aware flag: last message in an author's contiguous run (within 5 minutes). */
function computeIsGroupTail(items: TimelineItem[]): Record<string, boolean> {
  const tails: Record<string, boolean> = {};
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    if (cur.kind !== 'msg') continue;
    const next = items[i + 1];
    let isTail = true;
    if (next && next.kind === 'msg') {
      const sameAuthor = next.msg.author.id === cur.msg.author.id;
      const withinWindow =
        new Date(next.msg.createdAt).getTime() - new Date(cur.msg.createdAt).getTime() < 5 * 60_000;
      if (sameAuthor && withinWindow) isTail = false;
    }
    tails[cur.msg.id] = isTail;
  }
  return tails;
}

/** First message in an author's contiguous group — shows avatar + header. */
function computeIsGroupHead(items: TimelineItem[]): Record<string, boolean> {
  const heads: Record<string, boolean> = {};
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    if (cur.kind !== 'msg') continue;
    const prev = items[i - 1];
    let isHead = true;
    if (prev && prev.kind === 'msg') {
      const sameAuthor = prev.msg.author.id === cur.msg.author.id;
      const withinWindow =
        new Date(cur.msg.createdAt).getTime() - new Date(prev.msg.createdAt).getTime() < 5 * 60_000;
      if (sameAuthor && withinWindow) isHead = false;
    }
    heads[cur.msg.id] = isHead;
  }
  return heads;
}

/* ---------- component ---------- */

export function TeamChatView({
  className,
  embedOperationsSocket = true,
}: {
  className?: string;
  embedOperationsSocket?: boolean;
}) {
  const { user } = useAuth();
  const { locale } = useLocale();
  const tChat = useTranslations('chat');
  const tCommon = useTranslations('common');
  const damageLabel = useDamageTypeLabel();
  const canCreateRequest = usePermission('SERVICE_REQUEST_CREATE');
  const canPost = usePermission('TEAM_CHAT_POST');
  const canReadDamage = usePermission('DAMAGE_REPORT_READ');
  const canUpdateDamage = usePermission('DAMAGE_REPORT_UPDATE');
  const qc = useQueryClient();
  const toast = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const hasInitialScrolledRef = useRef(false);
  const prevTimelineTailRef = useRef<string | null>(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [body, setBody] = useState('');
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [newReqOpen, setNewReqOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchMsgId = useRef<string | null>(null);

  const { data: messages = [], isLoading: loadingMsg } = useQuery({
    queryKey: ['team-chat-messages', locale],
    queryFn: () => api<ChatMsg[]>(`/team-chat/messages?limit=300&lang=${locale}`),
  });

  const { data: requests = [], isLoading: loadingReq } = useQuery({
    queryKey: ['service-requests'],
    queryFn: () => api<ReqRow[]>('/service-requests'),
  });

  const { data: damages = [], isLoading: loadingDmg } = useQuery({
    queryKey: ['damage-reports'],
    queryFn: () => api<DmgRow[]>('/damage-reports'),
    enabled: canReadDamage,
  });

  const timeline = useMemo<TimelineItem[]>(() => {
    const m: TimelineItem[] = messages.map((msg) => ({
      kind: 'msg',
      at: msg.createdAt,
      key: `m-${msg.id}`,
      msg,
    }));
    const r: TimelineItem[] = requests.map((req) => ({
      kind: 'req',
      at: req.createdAt,
      key: `r-${req.id}`,
      req,
    }));
    const d: TimelineItem[] = damages.map((dmg) => ({
      kind: 'dmg',
      at: dmg.reportedAt,
      key: `d-${dmg.id}`,
      dmg,
    }));
    const combined = [...m, ...r, ...d].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Inject day dividers at each date boundary.
    const withDividers: TimelineItem[] = [];
    let lastDay: Date | null = null;
    for (const item of combined) {
      const d = new Date(item.at);
      if (!lastDay || !sameDay(lastDay, d)) {
        withDividers.push({
          kind: 'day',
          at: item.at,
          key: `d-${d.toDateString()}`,
          label: formatDayLabel(item.at),
        });
        lastDay = d;
      }
      withDividers.push(item);
    }
    return withDividers;
  }, [messages, requests, damages]);

  const groupTails = useMemo(() => computeIsGroupTail(timeline), [timeline]);
  const groupHeads = useMemo(() => computeIsGroupHead(timeline), [timeline]);

  useEffect(() => {
    if (!embedOperationsSocket) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const socket = getSocket(token);
    if (!socket) return undefined;
    const onChat = () => qc.invalidateQueries({ queryKey: ['team-chat-messages', locale] });
    const onReact = () => qc.invalidateQueries({ queryKey: ['team-chat-messages', locale] });
    const onReq = () => qc.invalidateQueries({ queryKey: ['service-requests'] });
    const onDmg = () => qc.invalidateQueries({ queryKey: ['damage-reports'] });
    socket.on('team_chat.message', onChat);
    socket.on('team_chat.reaction', onReact);
    socket.on('service_request.created', onReq);
    socket.on('service_request.claimed', onReq);
    socket.on('service_request.resolved', onReq);
    socket.on('service_request.updated', onReq);
    socket.on('damage_report.created', onDmg);
    socket.on('damage_report.updated', onDmg);
    return () => {
      socket?.off('team_chat.message', onChat);
      socket?.off('team_chat.reaction', onReact);
      socket?.off('service_request.created', onReq);
      socket?.off('service_request.claimed', onReq);
      socket?.off('service_request.resolved', onReq);
      socket?.off('service_request.updated', onReq);
      socket?.off('damage_report.created', onDmg);
      socket?.off('damage_report.updated', onDmg);
    };
  }, [embedOperationsSocket, qc, locale]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto', force = false) => {
    const el = scrollContainerRef.current;
    if (!el || el.clientHeight === 0) return false;
    const top = Math.max(0, el.scrollHeight - el.clientHeight);
    if (behavior === 'smooth') {
      el.scrollTo({ top, behavior: 'smooth' });
    } else {
      el.scrollTop = top;
    }
    if (force || isNearBottomRef.current) {
      isNearBottomRef.current = true;
      setShowJumpToBottom(false);
    }
    return true;
  }, []);

  const updateNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToBottom(false);
  }, []);

  const handleScroll = useCallback(() => {
    updateNearBottom();
  }, [updateNearBottom]);

  const timelineTailKey = timeline.length > 0 ? timeline[timeline.length - 1].key : null;

  useLayoutEffect(() => {
    if (loadingMsg || loadingReq || (canReadDamage && loadingDmg)) return;
    if (timeline.length === 0) return;

    const isInitial = !hasInitialScrolledRef.current;
    const tailChanged = timelineTailKey !== prevTimelineTailRef.current;

    if (isInitial) {
      if (scrollToBottom('auto', true)) {
        hasInitialScrolledRef.current = true;
        prevTimelineTailRef.current = timelineTailKey;
      }
      return;
    }

    if (!tailChanged) return;
    prevTimelineTailRef.current = timelineTailKey;

    if (isNearBottomRef.current) {
      scrollToBottom('smooth', true);
    } else {
      setShowJumpToBottom(true);
    }
  }, [loadingMsg, loadingReq, loadingDmg, canReadDamage, timeline, timelineTailKey, scrollToBottom]);

  useEffect(() => {
    if (loadingMsg || loadingReq || (canReadDamage && loadingDmg) || timeline.length === 0 || hasInitialScrolledRef.current) return;

    let frame = 0;
    let rafId = 0;
    const retry = () => {
      if (hasInitialScrolledRef.current || frame++ > 40) return;
      if (scrollToBottom('auto', true)) {
        hasInitialScrolledRef.current = true;
        prevTimelineTailRef.current = timelineTailKey;
        return;
      }
      rafId = requestAnimationFrame(retry);
    };
    rafId = requestAnimationFrame(retry);
    return () => cancelAnimationFrame(rafId);
  }, [loadingMsg, loadingReq, loadingDmg, canReadDamage, timeline.length, timelineTailKey, scrollToBottom]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onResize = () => {
      if (!hasInitialScrolledRef.current) {
        if (scrollToBottom('auto', true)) {
          hasInitialScrolledRef.current = true;
          prevTimelineTailRef.current = timelineTailKey;
        }
        return;
      }
      if (isNearBottomRef.current) scrollToBottom('auto', true);
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    const inner = el.firstElementChild;
    if (inner) observer.observe(inner);

    return () => observer.disconnect();
  }, [scrollToBottom, loadingMsg, loadingReq, loadingDmg, canReadDamage, timeline.length, timelineTailKey]);

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
    mutationFn: (payload: { text: string; replyToId?: string; mentionUserIds: string[] }) =>
      api('/team-chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          body: payload.text,
          replyToId: payload.replyToId,
          mentionUserIds: payload.mentionUserIds,
        }),
      }),
    onSuccess: () => {
      setBody('');
      setMentionUserIds([]);
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['team-chat-messages', locale] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-chat-messages', locale] }),
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

  const patchDamageStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/damage-reports/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['damage-reports'] }),
  });

  function onSend(e: FormEvent) {
    e.preventDefault();
    const t = body.trim();
    if (!t || send.isPending || !canPost) return;
    send.mutate({ text: t, replyToId: replyTo?.id, mentionUserIds });
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
    <div
      className={clsx(
        // Subtle tinted chat backdrop — kept within existing tokens so the color scheme matches.
        'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(244,241,234,0.6),rgba(244,241,234,0.35))]',
        className,
      )}
    >
      <div
        className="relative h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end">
        {(loadingMsg || loadingReq || (canReadDamage && loadingDmg)) && (
          <p className="text-sm text-ink-muted">Loading…</p>
        )}
        {!loadingMsg &&
          !loadingReq &&
          !(canReadDamage && loadingDmg) &&
          timeline.filter((i) => i.kind !== 'day').length === 0 && (
          <p className="mt-12 text-center text-sm text-ink-muted">
            No messages or requests yet. Say hi to your team 👋
          </p>
        )}

        <ul className="flex w-full flex-col">
          {timeline.map((item) => {
            if (item.kind === 'day') {
              return (
                <li key={item.key} className="my-3 flex justify-center">
                  <span className="rounded-full bg-surface/90 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted shadow-card ring-1 ring-border/60">
                    {item.label}
                  </span>
                </li>
              );
            }

            if (item.kind === 'req') {
              const r = item.req;
              const active = r.status !== 'RESOLVED' && r.status !== 'CANCELLED';
              return (
                <li key={item.key} className="my-2 flex justify-center">
                  <div
                    className={clsx(
                      'w-full max-w-xl rounded-2xl border px-4 py-3 shadow-sm',
                      active
                        ? 'border-amber-500/35 bg-amber-50/90'
                        : 'border-border/70 bg-surface/80 text-ink-muted',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          Service request
                        </p>
                        <p className="mt-1 text-base font-semibold text-ink">
                          Room {r.room.roomNumber}
                          <span className="font-normal text-ink-muted"> · {r.type.label}</span>
                        </p>
                        <p className="mt-1 text-sm text-ink-muted">{statusLine(r)}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <PriorityBadge priority={r.priority} />
                          <span className="text-[10px] text-ink-muted/80">{formatClock(r.createdAt)}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {isHk && active && (r.status === 'OPEN' || r.status === 'CREATED') && (
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
                          active &&
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
                    </div>
                  </div>
                </li>
              );
            }

            if (item.kind === 'dmg') {
              const d = item.dmg;
              const active = d.status !== 'RESOLVED';
              return (
                <li key={item.key} className="my-2 flex justify-center">
                  <div
                    className={clsx(
                      'w-full max-w-xl overflow-hidden rounded-2xl border shadow-sm',
                      active
                        ? 'border-rose-500/35 bg-rose-50/90'
                        : 'border-border/70 bg-surface/80 text-ink-muted',
                    )}
                  >
                    <div className="aspect-[16/9] max-h-40 bg-surface-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.photoUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                            Damage report
                          </p>
                          <p className="mt-1 text-base font-semibold text-ink">
                            Room {d.room.roomNumber}
                            <span className="font-normal text-ink-muted"> · {damageLabel(d.damageType)}</span>
                          </p>
                          <p className="mt-1 text-sm leading-snug text-ink">{truncateBody(d.description, 160)}</p>
                          <p className="mt-1 text-sm text-ink-muted">
                            {formatUserWithTitlePrefix(d.reportedBy.name, d.reportedBy.titlePrefix)} ·{' '}
                            {damageStatusLine(d)}
                          </p>
                          <span className="mt-2 inline-block text-[10px] text-ink-muted/80">
                            {formatClock(d.reportedAt)}
                          </span>
                        </div>
                        {canUpdateDamage && (
                          <select
                            className="min-h-[36px] shrink-0 rounded-btn border border-border bg-surface px-2 text-xs"
                            value={d.status}
                            disabled={patchDamageStatus.isPending}
                            onChange={(e) =>
                              patchDamageStatus.mutate({ id: d.id, status: e.target.value })
                            }
                          >
                            {DAMAGE_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0) + s.slice(1).toLowerCase()}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            }

            const m = item.msg;
            const mine = m.author.id === user?.id;
            const isTail = groupTails[m.id] ?? true;
            const isHead = groupHeads[m.id] ?? true;

            return (
              <li
                key={item.key}
                className={clsx(
                  'group relative flex w-full touch-pan-y',
                  mine ? 'justify-end' : 'justify-start',
                  isHead ? 'mt-3' : 'mt-0.5',
                )}
                onTouchStart={(e) => onMsgTouchStart(e, m.id)}
                onTouchEnd={(e) => onMsgTouchEnd(e, m)}
              >
                <div
                  className={clsx(
                    'flex max-w-[85%] items-end gap-2 sm:max-w-[72%]',
                    mine ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  <div className="w-8 shrink-0">
                    {!mine && isTail ? (
                      <Avatar name={m.author.name} url={m.author.avatarUrl} size={32} />
                    ) : null}
                  </div>

                  <div className="relative min-w-0">
                    <div
                      className={clsx(
                        'relative min-w-[56px] px-3.5 py-2 text-sm shadow-sm',
                        mine
                          ? 'bg-action-muted text-ink'
                          : 'bg-surface text-ink border border-border/60',
                        // WhatsApp-ish rounded corners w/ tail:
                        mine
                          ? isTail
                            ? 'rounded-2xl rounded-br-md'
                            : 'rounded-2xl'
                          : isTail
                            ? 'rounded-2xl rounded-bl-md'
                            : 'rounded-2xl',
                      )}
                    >
                      {!mine && isHead && (
                        <div className="mb-0.5 flex items-baseline gap-1.5">
                          <span className="text-[12px] font-semibold text-ink">{m.author.name}</span>
                          <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                            {userTitlePrefixLabel(m.author.titlePrefix)}
                          </span>
                        </div>
                      )}

                      {m.replyTo != null && (
                        <div
                          className={clsx(
                            'mb-1.5 rounded-md border-l-[3px] px-2 py-1 text-[11px]',
                            mine
                              ? 'border-ink/35 bg-ink/5'
                              : 'border-action/60 bg-action-muted/40',
                          )}
                        >
                          <span className="font-semibold text-ink">{m.replyTo.author.name}</span>
                          <p className="mt-0.5 truncate text-ink-muted">{truncateBody(m.replyTo.body, 120)}</p>
                        </div>
                      )}

                      <ChatMessageBody msg={m} mine={mine} mentions={m.mentions} />

                      <span
                        className={clsx(
                          'mt-0.5 block text-right text-[10px] leading-none text-ink-muted/80',
                          'tabular-nums',
                        )}
                      >
                        {formatClock(m.createdAt)}
                      </span>

                      {/* hover reply handle (desktop) */}
                      <button
                        type="button"
                        title="Reply"
                        aria-label="Reply to message"
                        onClick={() => startReply(m)}
                        className={clsx(
                          'absolute top-1 hidden h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-ink-muted shadow-sm transition-opacity hover:text-ink group-hover:flex',
                          mine ? '-left-9' : '-right-9',
                        )}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="M10 9V5L3 12l7 7v-4.1c5 0 8.5 1.6 11 5.1-1-6-4.5-12-11-13z"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {/* reaction add button, floats bottom-corner */}
                      {canPost && (
                        <button
                          type="button"
                          title="Add reaction"
                          aria-label="Add reaction"
                          onClick={() => setPickerFor((id) => (id === m.id ? null : m.id))}
                          data-chat-reaction-picker
                          className={clsx(
                            'absolute -bottom-3 hidden h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-base shadow-sm transition-opacity group-hover:flex',
                            mine ? '-left-3' : '-right-3',
                          )}
                        >
                          <span aria-hidden>🙂</span>
                        </button>
                      )}
                    </div>

                    {(m.reactions ?? []).length > 0 && (
                      <div
                        className={clsx(
                          '-mt-1.5 flex flex-wrap items-center gap-1 px-0.5',
                          mine ? 'justify-end' : 'justify-start',
                        )}
                        data-chat-reaction-picker
                      >
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
                                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] shadow-sm transition-colors',
                                rx.me
                                  ? 'border-action/40 bg-action-muted font-medium text-ink'
                                  : 'border-border bg-surface text-ink-muted hover:bg-surface-muted',
                              )}
                            >
                              <span>{def.emoji}</span>
                              <span className="tabular-nums">{rx.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {pickerFor === m.id && canPost && (
                      <div
                        className={clsx(
                          'absolute z-10 mt-1 flex gap-1 rounded-full border border-border bg-surface p-1 shadow-lift',
                          mine ? 'right-0' : 'left-0',
                        )}
                        data-chat-reaction-picker
                      >
                        {REACTION_TYPES.map((rt) => (
                          <button
                            key={rt.type}
                            type="button"
                            title={rt.label}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-xl hover:bg-surface-muted"
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
        </div>
      </div>

      {showJumpToBottom && (
        <div className="pointer-events-none relative z-10 -mt-10 flex justify-center">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth', true)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-card transition hover:bg-surface-muted"
            aria-label="Jump to latest messages"
          >
            <span aria-hidden>↓</span>
            New messages
          </button>
        </div>
      )}

      {canPost && (
        <form onSubmit={onSend} className="shrink-0 border-t border-border bg-surface/95 backdrop-blur">
          {replyTo && (
            <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-2 border-b border-border/60 bg-action-muted/30 px-3 py-2 text-xs">
              <div className="min-w-0 border-l-[3px] border-action/60 pl-2">
                <p className="font-semibold text-ink">Replying to {replyTo.author.name}</p>
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
          <div className="mx-auto flex w-full max-w-3xl items-end gap-2 px-3 py-2.5 sm:px-4">
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="shrink-0 rounded-full transition-transform hover:scale-[1.03]"
              aria-label="Edit your profile photo"
              title="Your profile photo"
            >
              <Avatar name={user?.name ?? '?'} url={user?.avatarUrl} size={40} ring />
            </button>

            {canCreateRequest && (
              <button
                type="button"
                onClick={() => setNewReqOpen(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-muted transition hover:border-action/40 hover:text-ink"
                aria-label="New service request"
                title="New service request"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            )}

            <MentionComposer
              value={body}
              onChange={setBody}
              mentionUserIds={mentionUserIds}
              onMentionUserIdsChange={setMentionUserIds}
              placeholder={replyTo ? 'Write a reply…' : 'Message the team…'}
              maxLength={2000}
              onSubmitShortcut={() => {
                const t = body.trim();
                if (!t || send.isPending || !canPost) return;
                send.mutate({ text: t, replyToId: replyTo?.id, mentionUserIds });
              }}
            />

            <button
              type="submit"
              disabled={send.isPending || !body.trim()}
              className={clsx(
                'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-card transition',
                body.trim() && !send.isPending
                  ? 'bg-action text-white hover:bg-action/90 active:bg-action/95'
                  : 'bg-surface-muted text-ink-muted',
              )}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M3.5 3.5l17 8.5-17 8.5 3-8.5-3-8.5z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
      )}

      {canCreateRequest && <NewRequestModal open={newReqOpen} onClose={() => setNewReqOpen(false)} />}
      <ProfilePhotoSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
