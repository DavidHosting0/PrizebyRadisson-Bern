'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import type { SidebarNavGroup } from '@/lib/nav-groups';
import { IconChevronLeft, IconChevronRight } from '@/components/nav/nav-icons';

function isNavActive(path: string, href: string) {
  if (href === '/r' || href === '/s') return path === href;
  return path === href || path.startsWith(`${href}/`);
}

export function AppSidebar({
  groups,
  path,
  header,
  footer,
  className,
}: {
  groups: SidebarNavGroup[];
  path: string;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={clsx(
        'hidden shrink-0 flex-col bg-sidebar text-white shadow-sidebar transition-[width] duration-panel ease-panel md:flex',
        collapsed ? 'w-[68px]' : 'w-60',
        className,
      )}
    >
      <div className={clsx('shrink-0 border-b border-sidebar-border', collapsed ? 'px-2 py-4' : 'px-4 py-5')}>
        {header}
      </div>

      <nav className="sidebar-scroll flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-2 py-4">
        {groups.map((group) => (
          <section key={group.id}>
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isNavActive(path, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={clsx(
                        'group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-panel ease-panel',
                        collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5',
                        active
                          ? 'bg-sidebar-active text-white'
                          : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-white',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white/90"
                          aria-hidden
                        />
                      )}
                      <span
                        className={clsx(
                          'flex shrink-0 items-center justify-center rounded-md transition-colors duration-panel',
                          collapsed ? 'h-9 w-9' : 'h-8 w-8',
                          active
                            ? 'bg-white/15 text-white'
                            : 'bg-white/5 text-sidebar-muted group-hover:bg-white/10 group-hover:text-white',
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border">
        {footer && !collapsed && <div className="px-4 py-4">{footer}</div>}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={clsx(
            'flex w-full items-center gap-2 border-t border-sidebar-border px-4 py-3 text-xs font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-white',
            collapsed && 'justify-center px-2',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <IconChevronRight className="h-4 w-4" />
          ) : (
            <>
              <IconChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
