'use client';

import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import {
  attachNavIcons,
  buildSidebarGroups,
  type NavGroupDef,
  type SidebarNavGroup,
  type SidebarNavItem,
} from '@/lib/nav-groups';
import type { NavItem } from '@/lib/permission-routes';
import { useTranslatedNav } from '@/lib/use-translated-nav';

export function useSidebarGroups(
  groupDefs: NavGroupDef[],
  nav: NavItem[],
  icons: Record<string, ComponentType<{ className?: string }>>,
): SidebarNavGroup[] {
  const tGroups = useTranslations('nav.groups');
  const translatedNav = useTranslatedNav(nav);
  const withIcons = attachNavIcons(translatedNav, icons);
  const groups = buildSidebarGroups(groupDefs, withIcons, icons);
  return groups.map((group) => ({
    ...group,
    label: tGroups(group.labelKey),
    items: group.items.map((item) => ({
      ...item,
      label: item.label ?? '',
    })),
  }));
}
