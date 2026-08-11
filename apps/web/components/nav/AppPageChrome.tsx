'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';

/**
 * Page title row aligned with AppSidebar logo block
 * (`px-4 py-5` + `min-h-12` + `border-b border-sidebar-border`).
 */
export function AppPageChrome({
  title,
  status,
  description,
  actions,
  toolbar,
  className,
}: {
  title: string;
  /** Short inline status next to the title (e.g. “Saved · …”). */
  status?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Optional filter / secondary strip under the title border. */
  toolbar?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('shrink-0 bg-sidebar text-white', className)}>
      <div className="flex flex-nowrap items-center justify-between gap-3 overflow-visible border-b border-sidebar-border px-4 py-5 md:px-5">
        <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-lg font-semibold tracking-tight text-white md:text-xl">
              {title}
            </h1>
            {status}
          </div>
          {description ? (
            <p className="truncate text-xs text-sidebar-muted md:text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
        ) : null}
      </div>
      {toolbar ? (
        <div className="flex flex-wrap gap-3 bg-sidebar-hover/40 px-4 py-3 md:px-5">{toolbar}</div>
      ) : null}
    </div>
  );
}

/** Dark page body under AppPageChrome — no white card shells by default. */
export function AppPageBody({
  children,
  className,
  canvas,
}: {
  children: ReactNode;
  className?: string;
  /** Immersive board-style canvas background. */
  canvas?: boolean;
}) {
  return (
    <div
      className={clsx(
        'sidebar-scroll min-h-0 min-w-0 flex-1',
        canvas
          ? 'overflow-auto bg-[#121a26] [background-image:radial-gradient(ellipse_at_top,_rgba(59,111,160,0.14),_transparent_55%)]'
          : 'overflow-y-auto bg-[#121a26]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shared dark surface for cards/panels inside AppPageBody. */
export const APP_DARK_CARD =
  'rounded-card border border-sidebar-border/60 bg-[#1A2332] text-slate-100 shadow-none';

export const APP_DARK_INPUT =
  'rounded-btn border border-sidebar-border bg-sidebar px-3 text-sm text-white placeholder:text-sidebar-muted focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30';
