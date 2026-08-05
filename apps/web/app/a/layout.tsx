'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { AppSidebar } from '@/components/nav/AppSidebar';
import { APP_TOP_BAR_CLASS } from '@/components/nav/app-top-bar';
import {
  IconArrivalCheck,
  IconBuilding,
  IconCalendar,
  IconClipboard,
  IconDash,
  IconGuide,
  IconMonitor,
  IconPackage,
  IconPerformance,
  IconPuzzle,
  IconReservations,
  type NavIcon,
} from '@/components/nav/nav-icons';
import type { SidebarNavGroup } from '@/lib/nav-groups';
import { formatUserWithTitlePrefix } from '@/lib/userTitlePrefix';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { CommandPaletteTrigger } from '@/components/command/CommandPaletteTrigger';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ProfilePhotoSheet } from '@/components/profile/ProfilePhotoSheet';
import { SidebarSettingsButton } from '@/components/nav/SidebarSettingsButton';

const ADMIN_NAV_ICONS: Record<string, NavIcon> = {
  '/a': IconDash,
  '/a/roles': IconBuilding,
  '/a/floor-plans': IconBuilding,
  '/a/guides': IconGuide,
  '/a/schichtuebergabe': IconClipboard,
  '/a/leihartikel': IconPackage,
  '/a/reservations-stats': IconReservations,
  '/a/arrival-check': IconArrivalCheck,
  '/a/activity-log': IconClipboard,
  '/a/integrations': IconPuzzle,
  '/a/emma': IconMonitor,
  '/a/puzzle': IconPuzzle,
  '/a/ai': IconPerformance,
  '/a/monitor-map': IconMonitor,
};

type AdminNavDef = {
  id: string;
  label: string;
  items: Array<{ href: string; label: string; exact?: boolean }>;
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common');
  const tAdmin = useTranslations('admin');
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'ADMIN') router.replace('/');
  }, [user, loading, router]);

  const groups: SidebarNavGroup[] = useMemo(() => {
    const defs: AdminNavDef[] = [
      {
        id: 'people',
        label: 'People',
        items: [
          { href: '/a', label: tAdmin('users'), exact: true },
          { href: '/a/roles', label: tAdmin('roles') },
        ],
      },
      {
        id: 'property',
        label: 'Property',
        items: [
          { href: '/a/floor-plans', label: 'Floor plans' },
          { href: '/a/guides', label: 'Guides' },
          { href: '/a/schichtuebergabe', label: 'To-Do-Vorlagen' },
          { href: '/a/leihartikel', label: 'Leihartikel' },
        ],
      },
      {
        id: 'analytics',
        label: tAdmin('analytics'),
        items: [
          { href: '/a/reservations-stats', label: tAdmin('reservationStats') },
          { href: '/a/arrival-check', label: 'Anreise-Check Vorschau' },
          { href: '/a/activity-log', label: 'Aktivitätsprotokoll' },
        ],
      },
      {
        id: 'integrations',
        label: tAdmin('integrations'),
        items: [
          { href: '/a/integrations', label: tAdmin('integrations') },
          { href: '/a/emma', label: 'EMMA' },
          { href: '/a/puzzle', label: 'Puzzle' },
          { href: '/a/ai', label: 'AI' },
          { href: '/a/monitor-map', label: 'Monitor Map' },
        ],
      },
    ];

    return defs.map((g) => ({
      id: g.id,
      labelKey: g.id,
      label: g.label,
      items: g.items.map((item) => ({
        href: item.href,
        labelKey: item.href,
        label: item.label,
        permission: 'SETTINGS_WRITE' as const,
        icon: ADMIN_NAV_ICONS[item.href] ?? IconDash,
      })),
    }));
  }, [tAdmin]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sidebar p-4">
        <p className="text-sm text-sidebar-muted">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-sidebar md:h-dvh md:flex-row md:overflow-hidden">
      <AppSidebar
        groups={groups}
        path={pathname}
        className="md:sticky md:top-0 md:h-dvh md:self-start"
        header={<BrandLogo className="brightness-0 invert" />}
        footer={
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SidebarSettingsButton onClick={() => setProfileOpen(true)} />
              <NotificationBell variant="onDark" />
            </div>
            <div>
              <p className="truncate text-sm font-medium text-white">
                {formatUserWithTitlePrefix(user.name, user.titlePrefix)}
              </p>
              <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                logout();
                router.replace('/login');
              }}
              className="text-xs font-medium text-sidebar-muted transition-colors hover:text-white"
            >
              {t('signOut')}
            </button>
          </div>
        }
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:h-dvh md:overflow-hidden">
        <header
          className={clsx(
            'flex items-center justify-between gap-3 px-5 py-3 md:hidden',
            APP_TOP_BAR_CLASS,
          )}
        >
          <BrandLogo compact className="brightness-0 invert" />
          <div className="flex items-center gap-2">
            <CommandPaletteTrigger onDark className="min-h-[36px] gap-2 px-2 text-xs" />
            <LanguageSwitcher compact onDark />
            <NotificationBell variant="onDark" />
          </div>
        </header>
        <main className="sidebar-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#121a26] md:overflow-hidden">
          {children}
        </main>
      </div>
      <ProfilePhotoSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
