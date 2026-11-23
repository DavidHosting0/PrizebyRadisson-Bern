'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
  type FocusEvent,
} from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';

type Mentionable = {
  id: string;
  name: string;
  titlePrefix: string;
  avatarUrl?: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  mentionUserIds: string[];
  onMentionUserIdsChange: (ids: string[]) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  /** Taller auto-grow while the mobile composer is focused. */
  expanded?: boolean;
  /** Larger type / min height for iPad kitchen chat. */
  density?: 'default' | 'tablet';
  onSubmitShortcut?: () => void;
  onFocus?: () => void;
  onBlur?: (e?: FocusEvent<HTMLTextAreaElement>) => void;
};

function preferNewlineOnEnter(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 767px)').matches ||
    navigator.maxTouchPoints > 0
  );
}

export function MentionComposer({
  value,
  onChange,
  mentionUserIds,
  onMentionUserIdsChange,
  placeholder,
  maxLength = 2000,
  className,
  expanded = false,
  density = 'default',
  onSubmitShortcut,
  onFocus,
  onBlur,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [newlineOnEnter, setNewlineOnEnter] = useState(false);
  const tablet = density === 'tablet';
  // Start as a single line; grow with content up to max (don't jump to a tall box on focus).
  const maxHeightPx = tablet ? (expanded ? 280 : 180) : expanded ? 220 : 120;
  const minHeightPx = tablet ? 56 : 44;

  useEffect(() => {
    setNewlineOnEnter(preferNewlineOnEnter());
    const mq = window.matchMedia('(pointer: coarse), (max-width: 767px)');
    const sync = () => setNewlineOnEnter(preferNewlineOnEnter());
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const resizeToContent = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Empty field must stay single-line. Measuring scrollHeight with a wrapped
    // placeholder (narrow idle layout) otherwise leaves a tall empty box after blur.
    if (!value) {
      el.style.height = `${minHeightPx}px`;
      return;
    }
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${Math.max(next, minHeightPx)}px`;
  }, [value, maxHeightPx, minHeightPx]);

  useLayoutEffect(() => {
    resizeToContent();
  }, [value, expanded, resizeToContent]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ['team-chat-mentionables', mentionQuery ?? ''],
    queryFn: () =>
      api<Mentionable[]>(
        `/team-chat/mentionables?q=${encodeURIComponent(mentionQuery ?? '')}`,
      ),
    enabled: mentionQuery !== null,
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
      const insert = `@${user.name} `;
      const next = before + insert + afterQuery;
      onChange(next.slice(0, maxLength));
      if (!mentionUserIds.includes(user.id)) {
        onMentionUserIdsChange([...mentionUserIds, user.id]);
      }
      closeMentions();
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        resizeToContent();
      });
    },
    [
      mentionStart,
      value,
      onChange,
      maxLength,
      mentionUserIds,
      onMentionUserIdsChange,
      closeMentions,
      resizeToContent,
    ],
  );

  const onInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);

    const el = e.target;
    if (!next) {
      el.style.height = `${minHeightPx}px`;
    } else {
      el.style.height = '0px';
      el.style.height = `${Math.max(Math.min(el.scrollHeight, maxHeightPx), minHeightPx)}px`;
    }

    const pos = el.selectionStart ?? next.length;
    const before = next.slice(0, pos);
    const atMatch = before.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionStart(pos - atMatch[0].length);
      setMentionQuery(atMatch[1]);
      setHighlightIdx(0);
    } else {
      closeMentions();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

    const modSend = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
    if (modSend) {
      e.preventDefault();
      onSubmitShortcut?.();
      return;
    }

    // Phone / touch: Enter inserts a newline; send via the button.
    // Desktop: Enter sends, Shift+Enter inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey && !newlineOnEnter) {
      e.preventDefault();
      onSubmitShortcut?.();
    }
  };

  useEffect(() => {
    if (highlightIdx >= suggestions.length) setHighlightIdx(0);
  }, [suggestions.length, highlightIdx]);

  return (
    <div className="relative min-w-0 flex-1">
      <textarea
        ref={textareaRef}
        rows={1}
        enterKeyHint={newlineOnEnter ? 'enter' : 'send'}
        className={clsx(
          'w-full resize-none overflow-y-auto rounded-2xl border border-sidebar-border bg-sidebar leading-snug text-white placeholder:text-sidebar-muted focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15',
          tablet ? 'min-h-[56px] px-4 py-3.5 text-[17px]' : 'min-h-[44px] px-3.5 py-2.5 text-base sm:px-4 sm:text-sm',
          className,
        )}
        style={{ maxHeight: maxHeightPx }}
        placeholder={placeholder}
        value={value}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={(e) => {
          if (!value && textareaRef.current) {
            textareaRef.current.style.height = `${minHeightPx}px`;
          } else {
            resizeToContent();
          }
          onBlur?.(e);
        }}
        maxLength={maxLength}
        autoComplete="off"
      />

      {mentionQuery !== null && suggestions.length > 0 && (
        <ul
          className={clsx(
            'absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar py-1 shadow-lift',
            tablet ? 'max-h-64' : 'max-h-48',
          )}
          role="listbox"
        >
          {suggestions.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === highlightIdx}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(u)}
                className={clsx(
                  'flex w-full items-center gap-2 text-left transition',
                  tablet ? 'px-4 py-3.5 text-base' : 'px-3 py-2.5 text-sm',
                  i === highlightIdx ? 'bg-action/20 text-white' : 'text-white hover:bg-white/10',
                )}
              >
                <Avatar name={u.name} url={u.avatarUrl} size={tablet ? 36 : 28} />
                <span className="min-w-0 truncate font-medium">
                  {formatUserWithTitlePrefix(u.name, u.titlePrefix)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
