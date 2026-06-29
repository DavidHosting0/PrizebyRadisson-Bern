import type { ReactNode } from 'react';
import clsx from 'clsx';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
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
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('page-enter space-y-10 p-5 md:p-8 lg:p-10', className)}>{children}</div>;
}
