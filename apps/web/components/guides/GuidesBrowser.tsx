'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { GuideListItemDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Updated today';
  if (diffDays === 1) return 'Updated yesterday';
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  return `Updated ${date.toLocaleDateString('de-CH')}`;
}

export function GuidesBrowser() {
  const t = useTranslations('guides');
  const tCommon = useTranslations('common');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['guides'],
    queryFn: () => api<GuideListItemDto[]>('/guides'),
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const g of data) {
      if (g.category) set.add(g.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((g) => {
      if (category && g.category !== category) return false;
      if (!q) return true;
      return (
        g.title.toLowerCase().includes(q) ||
        (g.summary?.toLowerCase().includes(q) ?? false) ||
        (g.category?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [data, search, category]);

  return (
    <div className="space-y-8 p-4 md:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">{t('title')}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Procedures, references, and how-tos for the reception desk.
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          placeholder={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-[44px] w-full max-w-md rounded-btn border border-border bg-surface px-4 text-sm text-ink placeholder:text-ink-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action/20"
        />
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                category === null
                  ? 'bg-ink text-white'
                  : 'bg-surface text-ink-muted hover:bg-surface-muted',
              )}
            >
              {tCommon('all')}
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={clsx(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  category === cat
                    ? 'bg-ink text-white'
                    : 'bg-surface text-ink-muted hover:bg-surface-muted',
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-ink-muted">Loading guides…</p>}

      {!isLoading && filtered.length === 0 && (
        <Card className="py-12 text-center">
          <p className="text-sm font-medium text-ink">No guides found</p>
          <p className="mt-1 text-sm text-ink-muted">
            {data.length === 0
              ? 'No guides have been published yet.'
              : 'Try a different search or category.'}
          </p>
        </Card>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((guide) => (
          <li key={guide.id}>
            <Link href={`/r/guides/${guide.id}`} className="group block h-full">
              <Card className="flex h-full flex-col transition-shadow duration-200 group-hover:shadow-lift">
                {guide.category && (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-action-muted px-2.5 py-0.5 text-xs font-medium text-action">
                    {guide.category}
                  </span>
                )}
                <h2 className="text-lg font-semibold text-ink group-hover:text-action">{guide.title}</h2>
                {guide.summary && (
                  <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink-muted">{guide.summary}</p>
                )}
                <p className="mt-4 text-xs text-ink-muted">{formatRelativeDate(guide.updatedAt)}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
