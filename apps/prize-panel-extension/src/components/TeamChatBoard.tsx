import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import imageCompression from 'browser-image-compression';
import { api } from '@/lib/api';
import { useAuth, usePermission } from '@/lib/auth-context';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/Button';
import { chatUi, dayLabel, type ChatUiStrings } from '@/lib/chat-ui';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const MORE_EMOJIS = [
  '👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '🙏', '👏', '🎉',
  '✅', '👀', '⁉️', '💯', '🤝', '💪', '😅', '🤔', '😴', '🙌',
  '⭐', '🍀', '☕', '🍕',
] as const;

type ReactionSummary = { emoji: string; count: number; me: boolean };

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
  photoUrl?: string | null;
  createdAt: string;
  author: ChatAuthor;
  replyTo: {
    id: string;
    body: string;
    bodyTranslated?: string | null;
    photoUrl?: string | null;
    createdAt: string;
    author: ChatAuthor;
    deleted?: boolean;
  } | null;
  reactions: ReactionSummary[];
  mentions?: ChatAuthor[];
};

type Mentionable = {
  id: string;
  name: string;
  titlePrefix: string;
  avatarUrl?: string | null;
};

type ReplyTarget = { id: string; body: string; photoUrl?: string | null; author: ChatAuthor };

const TITLE_LABELS: Record<string, string> = {
  CLEANER: 'Cleaner',
  HOUSEKEEPING_SUPERVISOR: 'Housekeeping Supervisor',
  RECEPTION: 'Reception',
  HTC_IN_TRAINING: 'HTC in Training',
  HTC: 'HTC',
  ADMIN: 'Admin',
  TECHNICIAN: 'Technician',
};

function formatAuthor(name: string, titlePrefix?: string | null) {
  const p = titlePrefix ? TITLE_LABELS[titlePrefix] ?? titlePrefix.replace(/_/g, ' ') : '';
  return p ? `${p} · ${name}` : name;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatClock(iso: string, locale: string) {
  const tag =
    locale === 'en'
      ? 'en-CH'
      : locale === 'pt'
        ? 'pt-PT'
        : locale === 'es'
          ? 'es-ES'
          : locale === 'tr'
            ? 'tr-TR'
            : locale === 'uk'
              ? 'uk-UA'
              : 'de-CH';
  return new Date(iso).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
}

function truncateBody(s: string, max = 80) {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function MentionText({
  body,
  mentions = [],
  className,
}: {
  body: string;
  mentions?: { id: string; name: string }[];
  className?: string;
}) {
  if (mentions.length === 0) {
    return <span className={clsx('whitespace-pre-wrap break-words', className)}>{body}</span>;
  }
  const byName = new Map(mentions.map((m) => [m.name.toLowerCase(), m]));
  const parts: ReactNode[] = [];
  const re = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const start = match.index;
    if (start > last) parts.push(body.slice(last, start));
    const mentionText = match[1];
    const hit = byName.get(mentionText.toLowerCase());
    if (hit) {
      parts.push(
        <span key={`${start}-${hit.id}`} className="font-semibold text-sky-300">
          @{mentionText}
        </span>,
      );
    } else {
      parts.push(`@${mentionText}`);
    }
    last = start + match[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return <span className={clsx('whitespace-pre-wrap break-words', className)}>{parts}</span>;
}

function MentionComposer({
  value,
  onChange,
  mentionUserIds,
  onMentionUserIdsChange,
  placeholder,
  onSubmitShortcut,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  mentionUserIds: string[];
  onMentionUserIdsChange: (ids: string[]) => void;
  placeholder?: string;
  onSubmitShortcut?: () => void;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const { data: suggestions = [] } = useQuery({
    queryKey: ['team-chat-mentionables', mentionQuery ?? ''],
    queryFn: () =>
      api<Mentionable[]>(`/team-chat/mentionables?q=${encodeURIComponent(mentionQuery ?? '')}`),
    enabled: mentionQuery !== null && !disabled,
    staleTime: 30_000,
  });

  const closeMentions = useCallback(() => {
    setMentionQuery(null);
    setMentionStart(null);
    setHighlightIdx(0);
  }, []);

  const pickMention = useCallback(
    (user: Mentionable) => {
      if (mentionStart === null) return;
      const before = value.slice(0, mentionStart);
      const afterAt = value.slice(mentionStart);
      const afterQuery = afterAt.replace(/^@[^\s]*/, '');
      const next = `${before}@${user.name} ${afterQuery}`.slice(0, 2000);
      onChange(next);
      if (!mentionUserIds.includes(user.id)) {
        onMentionUserIdsChange([...mentionUserIds, user.id]);
      }
      closeMentions();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [mentionStart, value, onChange, mentionUserIds, onMentionUserIdsChange, closeMentions],
  );

  function onInputChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const pos = e.target.selectionStart ?? next.length;
    const before = next.slice(0, pos);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionStart(pos - atMatch[0].length);
      setMentionQuery(atMatch[1]);
      setHighlightIdx(0);
    } else {
      closeMentions();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        pickMention(suggestions[highlightIdx]);
      } else if (e.key === 'Escape') {
        closeMentions();
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmitShortcut?.();
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={textareaRef}
        rows={1}
        disabled={disabled}
        className="max-h-20 min-h-[32px] w-full resize-none rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white placeholder:text-sidebar-muted focus:border-action focus:outline-none disabled:opacity-50"
        placeholder={placeholder}
        value={value}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        maxLength={2000}
        autoComplete="off"
      />
      {mentionQuery !== null && suggestions.length > 0 && (
        <ul className="absolute bottom-full left-0 z-30 mb-1 max-h-36 w-full overflow-y-auto rounded-lg border border-white/15 bg-sidebar-hover py-0.5 shadow-lift">
          {suggestions.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(u)}
                className={clsx(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px]',
                  i === highlightIdx ? 'bg-white/15 text-white' : 'text-slate-200 hover:bg-white/10',
                )}
              >
                <Avatar name={u.name} url={u.avatarUrl} size={22} />
                <span className="min-w-0 truncate font-medium">
                  {formatAuthor(u.name, u.titlePrefix)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MessageMenu({
  open,
  x,
  y,
  canReact,
  canDelete,
  onReact,
  onReply,
  onDelete,
  onClose,
  ui,
}: {
  open: boolean;
  x: number;
  y: number;
  canReact: boolean;
  canDelete: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDelete: () => void;
  onClose: () => void;
  ui: ChatUiStrings;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!open) setShowMore(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) {
      setPos({ left: x, top: y });
      return;
    }
    const pad = 8;
    const rect = el.getBoundingClientRect();
    setPos({
      left: Math.max(pad, Math.min(x - rect.width / 2, window.innerWidth - rect.width - pad)),
      top: Math.max(pad, Math.min(y - rect.height - 6, window.innerHeight - rect.height - pad)),
    });
  }, [open, x, y, showMore]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]">
      <div
        ref={panelRef}
        role="menu"
        className="pointer-events-auto absolute min-w-[200px] overflow-hidden rounded-xl border border-white/15 bg-sidebar shadow-lift"
        style={{ left: pos.left, top: pos.top }}
      >
        {canReact && (
          <div className="border-b border-white/10 px-1.5 py-1.5">
            {!showMore ? (
              <div className="flex flex-wrap items-center gap-0.5">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base hover:bg-white/10"
                    onClick={() => onReact(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sidebar-muted hover:bg-white/10"
                  onClick={() => setShowMore(true)}
                  title={ui.more}
                  aria-label={ui.moreEmojis}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-1 flex items-center justify-between px-1">
                  <span className="text-[9px] font-semibold uppercase text-sidebar-muted">{ui.emojis}</span>
                  <button
                    type="button"
                    className="text-[9px] text-sky-300"
                    onClick={() => setShowMore(false)}
                  >
                    {ui.back}
                  </button>
                </div>
                <div className="grid max-h-36 grid-cols-6 gap-0.5 overflow-y-auto">
                  {MORE_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-base hover:bg-white/10"
                      onClick={() => onReact(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="py-0.5">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-slate-100 hover:bg-white/10"
            onClick={onReply}
          >
            {ui.reply}
          </button>
          {canDelete && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-red-300 hover:bg-white/10"
              onClick={onDelete}
            >
              {ui.delete}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MessageBody({
  msg,
  mentions,
  ui,
}: {
  msg: ChatMsg;
  mentions?: ChatAuthor[];
  ui: ChatUiStrings;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = !!msg.isTranslated && !!msg.bodyTranslated;
  const displayBody = hasTranslation && showOriginal ? msg.bodyTranslated! : msg.body;
  const hasText = !!displayBody.trim();

  return (
    <>
      {msg.photoUrl && (
        <a
          href={msg.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx('block overflow-hidden rounded-md', hasText ? 'mb-1' : '')}
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.photoUrl} alt={ui.photoAlt} className="max-h-40 w-full object-cover" />
        </a>
      )}
      {hasText && (
        <MentionText body={displayBody} mentions={mentions} className="text-[11px] leading-snug" />
      )}
      {hasTranslation && hasText && (
        <button
          type="button"
          onClick={() => setShowOriginal((v) => !v)}
          title={showOriginal ? ui.showTranslation : ui.showOriginal}
          aria-label={showOriginal ? ui.showTranslation : ui.showOriginal}
          className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-sky-300/90 hover:bg-white/10 hover:text-sky-200"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M7 8h11l-2.5-2.5M18 16H7l2.5 2.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </>
  );
}

export function TeamChatBoard() {
  const { user } = useAuth();
  const canPost = usePermission('TEAM_CHAT_POST');
  const canDelete = usePermission('TEAM_CHAT_DELETE');
  const qc = useQueryClient();
  const locale = user?.preferredLocale || 'de';
  const ui = useMemo(() => chatUi(locale), [locale]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [body, setBody] = useState('');
  const [mentionUserIds, setMentionUserIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ message: ChatMsg; x: number; y: number } | null>(null);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['team-chat-messages', locale],
    queryFn: () => api<ChatMsg[]>(`/team-chat/messages?limit=200&lang=${locale}`),
    refetchInterval: 5_000,
  });

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const clearPhoto = useCallback(() => {
    setPhotoFile(null);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (photoInputRef.current) photoInputRef.current.value = '';
  }, []);

  const send = useMutation({
    mutationFn: async (payload: {
      text: string;
      replyToId?: string;
      mentionUserIds: string[];
      photo?: File | null;
    }) => {
      let photoS3Key: string | undefined;
      if (payload.photo) {
        const compressed = await imageCompression(payload.photo, {
          maxSizeMB: 0.6,
          maxWidthOrHeight: 1600,
        });
        const contentType = compressed.type || payload.photo.type || 'image/jpeg';
        const presign = await api<{ uploadUrl: string; key: string }>('/team-chat/presign', {
          method: 'POST',
          body: JSON.stringify({ contentType }),
        });
        const putRes = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: compressed,
        });
        if (!putRes.ok) throw new Error(ui.photoUploadFailed);
        photoS3Key = presign.key;
      }
      return api('/team-chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          body: payload.text,
          replyToId: payload.replyToId,
          mentionUserIds: payload.mentionUserIds,
          photoS3Key,
        }),
      });
    },
    onSuccess: () => {
      setBody('');
      setMentionUserIds([]);
      setReplyTo(null);
      clearPhoto();
      setErr(null);
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const toggleReaction = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api(`/team-chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }),
    onSuccess: () => {
      setMenu(null);
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    },
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      api(`/team-chat/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setMenu(null);
      qc.invalidateQueries({ queryKey: ['team-chat-messages'] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const timeline = useMemo(() => {
    const items: Array<
      | { kind: 'day'; key: string; label: string }
      | { kind: 'msg'; key: string; msg: ChatMsg }
    > = [];
    let lastDay: Date | null = null;
    for (const msg of messages) {
      const d = new Date(msg.createdAt);
      if (!lastDay || !sameDay(lastDay, d)) {
        items.push({
          kind: 'day',
          key: `d-${d.toDateString()}`,
          label: dayLabel(msg.createdAt, locale),
        });
        lastDay = d;
      }
      items.push({ kind: 'msg', key: `m-${msg.id}`, msg });
    }
    return items;
  }, [messages, locale]);

  const groupHeads = useMemo(() => {
    const heads: Record<string, boolean> = {};
    let prevMsg: ChatMsg | null = null;
    for (const item of timeline) {
      if (item.kind !== 'msg') {
        prevMsg = null;
        continue;
      }
      const cur = item.msg;
      let isHead = true;
      if (prevMsg) {
        const sameAuthor = prevMsg.author.id === cur.author.id;
        const within =
          new Date(cur.createdAt).getTime() - new Date(prevMsg.createdAt).getTime() < 5 * 60_000;
        if (sameAuthor && within) isHead = false;
      }
      heads[cur.id] = isHead;
      prevMsg = cur;
    }
    return heads;
  }, [timeline]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || isLoading) return;
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, isLoading]);

  function onScroll() {
    const el = scrollerRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 60;
  }

  function doSend() {
    const text = body.trim();
    if ((!text && !photoFile) || !canPost || send.isPending) return;
    send.mutate({ text, replyToId: replyTo?.id, mentionUserIds, photo: photoFile });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    doSend();
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-2.5 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold text-white">{ui.title}</p>
          <p className="truncate text-[9px] text-sidebar-muted">{ui.subtitle}</p>
        </div>
      </header>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      >
        {isLoading && (
          <p className="py-4 text-center text-[11px] text-sidebar-muted">{ui.loading}</p>
        )}
        {!isLoading && messages.length === 0 && (
          <p className="py-6 text-center text-[11px] text-sidebar-muted">{ui.empty}</p>
        )}

        <ul className="flex flex-col gap-1">
          {timeline.map((item) => {
            if (item.kind === 'day') {
              return (
                <li key={item.key} className="my-1.5 flex justify-center">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-sidebar-muted">
                    {item.label}
                  </span>
                </li>
              );
            }

            const m = item.msg;
            const mine = user?.id === m.author.id;
            const isHead = groupHeads[m.id];

            return (
              <li
                key={item.key}
                className={clsx('flex gap-1.5', mine ? 'flex-row-reverse' : 'flex-row')}
              >
                <div className="w-6 shrink-0">
                  {isHead && !mine ? (
                    <Avatar name={m.author.name} url={m.author.avatarUrl} size={22} />
                  ) : null}
                </div>
                <div className={clsx('min-w-0 max-w-[82%]', mine && 'items-end')}>
                  {isHead && (
                    <div
                      className={clsx(
                        'mb-0.5 flex flex-wrap items-baseline gap-x-1',
                        mine ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span className="truncate text-[9px] font-semibold text-slate-200">
                        {formatAuthor(m.author.name, m.author.titlePrefix)}
                      </span>
                      <span className="text-[8px] text-sidebar-muted">{formatClock(m.createdAt, locale)}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ message: m, x: e.clientX, y: e.clientY });
                    }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('[data-reaction]')) return;
                      setMenu({ message: m, x: e.clientX, y: e.clientY });
                    }}
                    className={clsx(
                      'w-full rounded-xl px-2.5 py-1.5 text-left transition',
                      mine
                        ? 'rounded-tr-sm bg-action text-white'
                        : 'rounded-tl-sm border border-white/10 bg-white/[0.08] text-slate-100',
                    )}
                  >
                    {m.replyTo && (
                      <div
                        className={clsx(
                          'mb-1 rounded-md border-l-2 px-1.5 py-0.5 text-[9px]',
                          mine
                            ? 'border-white/50 bg-black/15 text-white/80'
                            : 'border-sky-400/60 bg-black/20 text-sidebar-muted',
                        )}
                      >
                        <p className="font-semibold">
                          {m.replyTo.deleted
                            ? ui.deletedMessage
                            : formatAuthor(m.replyTo.author.name, m.replyTo.author.titlePrefix)}
                        </p>
                        <p className="truncate">
                          {m.replyTo.deleted
                            ? '—'
                            : m.replyTo.body.trim()
                              ? truncateBody(m.replyTo.body)
                              : m.replyTo.photoUrl
                                ? ui.photoMessage
                                : '—'}
                        </p>
                      </div>
                    )}
                    <MessageBody msg={m} mentions={m.mentions} ui={ui} />
                  </button>
                  {m.reactions.length > 0 && (
                    <div
                      className={clsx(
                        'mt-0.5 flex flex-wrap gap-0.5',
                        mine ? 'justify-end' : 'justify-start',
                      )}
                    >
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          data-reaction
                          disabled={!canPost}
                          onClick={() =>
                            toggleReaction.mutate({ messageId: m.id, emoji: r.emoji })
                          }
                          className={clsx(
                            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] ring-1',
                            r.me
                              ? 'bg-action/30 text-white ring-action/50'
                              : 'bg-white/10 text-slate-200 ring-white/15',
                          )}
                        >
                          <span>{r.emoji}</span>
                          <span>{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {!isHead && (
                    <p
                      className={clsx(
                        'mt-0.5 text-[7px] text-sidebar-muted',
                        mine ? 'text-right' : 'text-left',
                      )}
                    >
                      {formatClock(m.createdAt, locale)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {replyTo && (
        <div className="flex shrink-0 items-start gap-2 border-t border-sidebar-border bg-white/[0.04] px-2 py-1.5">
          <div className="min-w-0 flex-1 border-l-2 border-action pl-2">
            <p className="truncate text-[9px] font-semibold text-sky-300">
              {ui.replyingTo(formatAuthor(replyTo.author.name, replyTo.author.titlePrefix))}
            </p>
            <p className="truncate text-[9px] text-sidebar-muted">
              {replyTo.body.trim()
                ? truncateBody(replyTo.body)
                : replyTo.photoUrl
                  ? ui.photoMessage
                  : '—'}
            </p>
          </div>
          <button
            type="button"
            className="text-[10px] text-sidebar-muted hover:text-white"
            onClick={() => setReplyTo(null)}
          >
            ✕
          </button>
        </div>
      )}

      {photoPreviewUrl && (
        <div className="flex shrink-0 items-center gap-2 border-t border-sidebar-border px-2 py-1.5">
          <div className="relative h-12 w-12 overflow-hidden rounded-md border border-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreviewUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute right-0 top-0 inline-flex h-4 w-4 items-center justify-center rounded-bl bg-black/70 text-[9px] text-white"
              aria-label={ui.removePhoto}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {canPost ? (
        <form onSubmit={onSubmit} className="shrink-0 border-t border-sidebar-border px-2 py-1.5">
          <div className="flex items-end gap-1.5">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file || !file.type.startsWith('image/')) return;
                setPhotoFile(file);
                setPhotoPreviewUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return URL.createObjectURL(file);
                });
              }}
            />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={send.isPending}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 text-sidebar-muted hover:text-white disabled:opacity-50"
              aria-label={ui.attachPhoto}
              title={ui.attachPhoto}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7.5A2.5 2.5 0 016.5 5h2.1l.9-1.4A1.5 1.5 0 0110.75 3h2.5a1.5 1.5 0 011.25.6L15.4 5h2.1A2.5 2.5 0 0120 7.5v9A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            </button>
            <MentionComposer
              value={body}
              onChange={setBody}
              mentionUserIds={mentionUserIds}
              onMentionUserIdsChange={setMentionUserIds}
              placeholder={ui.placeholder}
              onSubmitShortcut={doSend}
              disabled={send.isPending}
            />
            <Button
              type="submit"
              variant="action"
              disabled={send.isPending || (!body.trim() && !photoFile)}
              className="h-8 shrink-0 rounded-full px-3 text-[11px]"
            >
              →
            </Button>
          </div>
          {err && <p className="mt-1 text-[9px] text-red-300">{err}</p>}
        </form>
      ) : (
        <p className="shrink-0 border-t border-sidebar-border px-2 py-2 text-center text-[10px] text-sidebar-muted">
          {ui.noPostPermission}
        </p>
      )}

      <MessageMenu
        open={Boolean(menu)}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        canReact={canPost}
        canDelete={canDelete}
        ui={ui}
        onReact={(emoji) => {
          if (!menu) return;
          toggleReaction.mutate({ messageId: menu.message.id, emoji });
        }}
        onReply={() => {
          if (!menu) return;
          setReplyTo({
            id: menu.message.id,
            body: menu.message.body,
            photoUrl: menu.message.photoUrl,
            author: menu.message.author,
          });
          setMenu(null);
        }}
        onDelete={() => {
          if (!menu) return;
          deleteMessage.mutate(menu.message.id);
        }}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}
