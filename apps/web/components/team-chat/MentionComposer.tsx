'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
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
  onSubmitShortcut?: () => void;
};

export function MentionComposer({
  value,
  onChange,
  mentionUserIds,
  onMentionUserIdsChange,
  placeholder,
  maxLength = 2000,
  className,
  onSubmitShortcut,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);

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
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [
      mentionStart,
      value,
      onChange,
      maxLength,
      mentionUserIds,
      onMentionUserIdsChange,
      closeMentions,
    ],
  );

  const onInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);

    const el = e.target;
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmitShortcut?.();
    }
  };

  useEffect(() => {
    if (highlightIdx >= suggestions.length) setHighlightIdx(0);
  }, [suggestions.length, highlightIdx]);

  return (
    <div className="relative flex-1">
      <textarea
        ref={textareaRef}
        rows={1}
        className={clsx(
          'min-h-[44px] w-full resize-none rounded-full border border-sidebar-border bg-sidebar px-4 py-2.5 text-sm text-white placeholder:text-sidebar-muted focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15',
          className,
        )}
        placeholder={placeholder}
        value={value}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        maxLength={maxLength}
        autoComplete="off"
      />

      {mentionQuery !== null && suggestions.length > 0 && (
        <ul
          className="absolute bottom-full left-0 z-20 mb-1 max-h-48 w-full overflow-y-auto rounded-xl border border-sidebar-border bg-sidebar py-1 shadow-lift"
          role="listbox"
        >
          {suggestions.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === highlightIdx}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(u)}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                  i === highlightIdx ? 'bg-action/20 text-white' : 'text-white hover:bg-white/10',
                )}
              >
                <Avatar name={u.name} url={u.avatarUrl} size={28} />
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
