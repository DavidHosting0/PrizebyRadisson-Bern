'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';

const ADMIN_NAV_GROUPS = [
  {
    labelKey: 'people',
    items: [
      { href: '/a', labelKey: 'members', exact: true },
      { href: '/a/roles', labelKey: 'roles' },
    ],
  },
  {
    labelKey: 'property',
    items: [
      { href: '/a/floor-plans', labelKey: 'floorPlans' },
      { href: '/a/guides', labelKey: 'guides' },
      { href: '/a/schichtuebergabe', labelKey: 'shiftHandover' },
      { href: '/a/leihartikel', labelKey: 'loans' },
    ],
  },
  {
    labelKey: 'analytics',
    items: [
      { href: '/a/reservations-stats', labelKey: 'reservationStats' },
      { href: '/a/arrival-check', labelKey: 'arrivalCheckPreview' },
      { href: '/a/activity-log', labelKey: 'activityLog' },
    ],
  },
  {
    labelKey: 'integrations',
    items: [
      { href: '/a/integrations', labelKey: 'integrations' },
      { href: '/a/emma', labelKey: 'emma' },
      { href: '/a/puzzle', labelKey: 'puzzle' },
      { href: '/a/ai', labelKey: 'ai' },
      { href: '/a/monitor-map', labelKey: 'monitorMap' },
    ],
  },
];

function navActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common');
  const tAdmin = useTranslations('admin');

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'ADMIN') router.replace('/');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
        <p className="text-sm text-ink-muted">{t('loading')}</p>
      </div>
    );
  }

  const groupLabels: Record<string, string> = {
    people: 'People',
    property: 'Property',
    analytics: tAdmin('analytics'),
    integrations: tAdmin('integrations'),
  };

  const itemLabels: Record<string, string> = {
    members: tAdmin('users'),
    roles: tAdmin('roles'),
    floorPlans: 'Floor plans',
    guides: 'Guides',
    shiftHandover: 'To-Do-Vorlagen',
    loans: 'Leihartikel',
    reservationStats: tAdmin('reservationStats'),
    arrivalCheckPreview: 'Anreise-Check Vorschau',
    activityLog: 'Aktivitätsprotokoll',
    integrations: tAdmin('integrations'),
    emma: 'EMMA',
    puzzle: 'Puzzle',
    ai: 'AI',
    monitorMap: 'Monitor Map',
  };

  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-border bg-surface shadow-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <BrandLogo compact />
          <div className="flex items-center gap-3">
            <LanguageSwitcher compact />
            <span className="truncate text-sm text-ink-muted">{user.email}</span>
          </div>
        </div>
        <div className="mx-auto max-w-7xl overflow-x-auto px-5 pb-4">
          <nav className="flex flex-wrap items-start gap-6">
            {ADMIN_NAV_GROUPS.map((group) => (
              <div key={group.labelKey} className="min-w-0">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  {groupLabels[group.labelKey] ?? group.labelKey}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.items.map((item) => {
                    const active = navActive(pathname, item.href, item.exact);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-panel',
                          active
                            ? 'bg-sidebar text-white'
                            : 'border border-border text-ink-muted hover:bg-surface-muted hover:text-ink',
                        )}
                      >
                        {itemLabels[item.labelKey] ?? item.labelKey}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl page-enter">{children}</div>
    </div>
  );
}
