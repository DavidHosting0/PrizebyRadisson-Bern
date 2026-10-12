'use client';

import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  USER_TITLE_PREFIX_OPTIONS,
  resolveChatTitlePrefix,
  userTitlePrefixLabel,
} from '@/lib/userTitlePrefix';

type Props = {
  /** Dark housekeeper profile page uses light text on dark cards. */
  tone?: 'light' | 'dark';
};

/**
 * Self-service chat role select. Null (empty option) falls back to app-area titlePrefix.
 */
export function ChatTitlePrefixField({ tone = 'light' }: Props) {
  const t = useTranslations('profile');
  const { user, refreshMe } = useAuth();
  const [value, setValue] = useState<string>(user?.chatTitlePrefix ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(user?.chatTitlePrefix ?? '');
  }, [user?.chatTitlePrefix]);

  const save = useMutation({
    mutationFn: async (next: string) => {
      setError(null);
      return api<{ id: string; chatTitlePrefix: string | null; titlePrefix: string }>(
        '/users/me/chat-title-prefix',
        {
          method: 'PATCH',
          body: JSON.stringify({ chatTitlePrefix: next === '' ? null : next }),
        },
      );
    },
    onSuccess: async () => {
      await refreshMe();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : t('chatRoleSaveFailed'));
      setValue(user?.chatTitlePrefix ?? '');
    },
  });

  if (!user) return null;

  const labelClass = tone === 'dark' ? 'font-medium text-white' : 'font-medium text-ink';
  const hintClass = tone === 'dark' ? 'text-xs text-sidebar-muted' : 'text-xs text-ink-muted';
  const selectClass =
    tone === 'dark'
      ? 'mt-1 w-full min-h-[44px] cursor-pointer rounded-btn border border-white/15 bg-ink/40 px-3 text-sm text-white focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15'
      : 'mt-1 w-full min-h-[44px] cursor-pointer rounded-btn border border-border bg-surface px-3 text-sm text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15';

  const appAreaLabel = userTitlePrefixLabel(user.titlePrefix) || t('chatRoleAppAreaFallback');
  const preview = userTitlePrefixLabel(resolveChatTitlePrefix({ ...user, chatTitlePrefix: value || null }));

  return (
    <label className="block text-sm">
      <span className={labelClass}>{t('chatRole')}</span>
      <p className={`mt-0.5 ${hintClass}`}>{t('chatRoleHint')}</p>
      <select
        className={selectClass}
        value={value}
        disabled={save.isPending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          save.mutate(next);
        }}
      >
        <option value="">{t('chatRoleDefault', { appArea: appAreaLabel })}</option>
        {USER_TITLE_PREFIX_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {preview ? (
        <p className={`mt-1 ${hintClass}`}>
          {t('chatRolePreview', { role: preview })}
          {save.isPending ? ` · ${t('saving')}` : null}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
    </label>
  );
}
