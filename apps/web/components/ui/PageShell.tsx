import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AppPageChrome } from '@/components/nav/AppPageChrome';

export function PageHeader({
  title,
  description,
  actions,
  className,
  tone = 'light',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  if (tone === 'dark') {
    return (
      <AppPageChrome
        title={title}
        description={description}
        actions={actions}
        className={className}
      />
    );
  }

  return (
    <div className={clsx('flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageSection({
  title,
  description,
  children,
  className,
  tone = 'light',
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <section className={className}>
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h2
              className={clsx(
                'text-base font-semibold',
                dark ? 'text-white' : 'text-ink',
              )}
            >
              {title}
            </h2>
          )}
          {description && (
            <p className={clsx('mt-1 text-sm', dark ? 'text-sidebar-muted' : 'text-ink-muted')}>
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageShell({
  children,
  className,
  tone = 'light',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'light' | 'dark';
}) {
  return (
    <div
      className={clsx(
        'page-enter',
        tone === 'dark'
          ? 'space-y-8 bg-[#121a26] p-4 text-slate-100 md:p-6 lg:p-8'
          : 'space-y-10 p-5 md:p-8 lg:p-10',
        className,
      )}
    >
      {children}
    </div>
  );
}
