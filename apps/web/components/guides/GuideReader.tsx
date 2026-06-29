'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { GuideDetailDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { MarkdownContent, extractToc } from './MarkdownContent';
import clsx from 'clsx';

export function GuideReader({ guideId }: { guideId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['guide', guideId],
    queryFn: () => api<GuideDetailDto>(`/guides/${guideId}`),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-ink-muted">Loading guide…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <Link href="/r/guides" className="text-sm font-medium text-action hover:underline">
          ← Back to guides
        </Link>
        <Card>
          <p className="text-sm text-ink-muted">Guide not found or no longer available.</p>
        </Card>
      </div>
    );
  }

  const toc = extractToc(data.body);
  const updatedLabel = new Date(data.updatedAt).toLocaleString('de-CH');

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/r/guides"
        className="inline-flex items-center gap-1 text-sm font-medium text-action hover:underline"
      >
        ← Back to guides
      </Link>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
        <article className="min-w-0">
          <header className="mb-8 border-b border-border pb-6">
            {data.category && (
              <span className="mb-3 inline-flex rounded-full bg-action-muted px-2.5 py-0.5 text-xs font-medium text-action">
                {data.category}
              </span>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">{data.title}</h1>
            {data.summary && <p className="mt-3 text-lg text-ink-muted">{data.summary}</p>}
            <p className="mt-4 text-sm text-ink-muted">Last updated {updatedLabel}</p>
          </header>

          <MarkdownContent content={data.body} />
        </article>

        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <nav className="sticky top-6 rounded-card border border-border bg-surface p-4 shadow-card">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                On this page
              </p>
              <ul className="space-y-2 text-sm">
                {toc.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className={clsx(
                        'block text-ink-muted transition-colors hover:text-action',
                        entry.level === 3 && 'pl-3',
                      )}
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
