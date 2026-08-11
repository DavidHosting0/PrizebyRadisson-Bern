'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { GuideDetailDto } from '@housekeeping/shared';
import { api } from '@/lib/api';
import { MarkdownContent, extractToc } from './MarkdownContent';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useLocale } from '@/lib/locale-context';
import { APP_DARK_CARD } from '@/components/nav/AppPageChrome';

export function GuideReader({ guideId }: { guideId: string }) {
  const t = useTranslations('guides');
  const { locale } = useLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['guide', guideId],
    queryFn: () => api<GuideDetailDto>(`/guides/${guideId}`),
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <p className="text-sm text-sidebar-muted">{t('loadingGuide')}</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <Link href="/r/guides" className="text-sm font-medium text-action hover:underline">
          {t('backToGuides')}
        </Link>
        <div className={clsx(APP_DARK_CARD, 'p-5')}>
          <p className="text-sm text-sidebar-muted">{t('notFound')}</p>
        </div>
      </div>
    );
  }

  const toc = extractToc(data.body);
  const updatedLabel = new Date(data.updatedAt).toLocaleString(locale);

  return (
    <div className="p-4 md:p-8">
      <Link
        href="/r/guides"
        className="inline-flex items-center gap-1 text-sm font-medium text-action hover:underline"
      >
        {t('backToGuides')}
      </Link>

      <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-10">
        <article className="min-w-0">
          <header className="mb-8 border-b border-sidebar-border/60 pb-6">
            {data.category && (
              <span className="mb-3 inline-flex rounded-full bg-action/15 px-2.5 py-0.5 text-xs font-medium text-action">
                {data.category}
              </span>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">{data.title}</h1>
            {data.summary && <p className="mt-3 text-lg text-sidebar-muted">{data.summary}</p>}
            <p className="mt-4 text-sm text-sidebar-muted">{t('lastUpdated', { date: updatedLabel })}</p>
          </header>

          <MarkdownContent content={data.body} dark />
        </article>

        {toc.length > 0 && (
          <aside className="hidden lg:block">
            <nav className={clsx(APP_DARK_CARD, 'sticky top-6 p-4')}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sidebar-muted">
                {t('onThisPage')}
              </p>
              <ul className="space-y-2 text-sm">
                {toc.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className={clsx(
                        'block text-sidebar-muted transition-colors hover:text-action',
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
