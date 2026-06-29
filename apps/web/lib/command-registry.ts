'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ComponentType } from 'react';
import type { Me } from '@/lib/api';
import {
  filterNavByPermission,
  hasPermission,
  RECEPTION_NAV,
  SUPERVISOR_NAV,
  HOUSEKEEPER_NAV,
  TECHNICIAN_NAV,
  type NavItem,
} from '@/lib/permission-routes';
import { RECEPTION_NAV_ICONS, SUPERVISOR_NAV_ICONS, IconDash } from '@/components/nav/nav-icons';

export type CommandItem = {
  id: string;
  group: string;
  label: string;
  subtitle?: string;
  keywords?: string[];
  href?: string;
  action?: 'newRequest' | 'openRoom';
  roomId?: string;
  imageUrl?: string | null;
  roomNumber?: string;
  roomStatus?: string;
  initials?: string;
  icon?: ComponentType<{ className?: string }>;
  onSelect: () => void;
};

const QUICK_HREFS: Record<string, string[]> = {
  RECEPTION: ['/r', '/r/arrivals', '/r/rooms', '/r/requests'],
  SUPERVISOR: ['/s', '/s/board', '/s/departures', '/s/room-tasks'],
  HOUSEKEEPER: ['/h', '/h/requests'],
  TECHNICIAN: ['/t/maintenance', '/t/rooms'],
  ADMIN: ['/a', '/a/roles', '/a/reservations-stats'],
};

function navForRole(role: string | undefined): NavItem[] {
  switch (role) {
    case 'RECEPTION':
      return RECEPTION_NAV;
    case 'SUPERVISOR':
      return SUPERVISOR_NAV;
    case 'HOUSEKEEPER':
      return HOUSEKEEPER_NAV;
    case 'TECHNICIAN':
      return TECHNICIAN_NAV;
    default:
      return [];
  }
}

function iconsForRole(role: string | undefined): Record<string, ComponentType<{ className?: string }>> {
  if (role === 'RECEPTION' || role === 'ADMIN') return RECEPTION_NAV_ICONS;
  if (role === 'SUPERVISOR') return SUPERVISOR_NAV_ICONS;
  return {};
}

export function buildQuickNavCommands(
  user: Me | null,
  tNav: (key: string) => string,
  tCmd: (key: string) => string,
  onNavigate: (href: string, item: Omit<CommandItem, 'onSelect'>) => void,
): CommandItem[] {
  if (!user) return [];
  const nav = filterNavByPermission(user, navForRole(user.role));
  const icons = iconsForRole(user.role);
  const quickHrefs = new Set(QUICK_HREFS[user.role] ?? []);

  return nav
    .filter((item) => quickHrefs.has(item.href))
    .map((item) => {
      const label = tNav(item.labelKey);
      const base = {
        id: `nav:${item.href}`,
        group: tCmd('groups.quickAccess'),
        label,
        keywords: [label, item.href],
        href: item.href,
        icon: icons[item.href] ?? IconDash,
      };
      return {
        ...base,
        onSelect: () => onNavigate(item.href, base),
      };
    });
}

export function buildNavCommands(
  user: Me | null,
  tNav: (key: string) => string,
  tCmd: (key: string) => string,
  onNavigate: (href: string, item: Omit<CommandItem, 'onSelect'>) => void,
): CommandItem[] {
  if (!user) return [];
  const nav = filterNavByPermission(user, navForRole(user.role));
  const icons = iconsForRole(user.role);

  return nav.map((item) => {
    const label = tNav(item.labelKey);
    const base = {
      id: `nav:${item.href}`,
      group: tCmd('groups.navigation'),
      label,
      keywords: [label, item.href],
      href: item.href,
      icon: icons[item.href] ?? IconDash,
    };
    return {
      ...base,
      onSelect: () => onNavigate(item.href, base),
    };
  });
}

export function buildActionCommands(
  user: Me | null,
  tCmd: (key: string) => string,
  onAction: (action: 'newRequest') => void,
): CommandItem[] {
  if (!user) return [];
  const items: CommandItem[] = [];
  if (hasPermission(user, 'SERVICE_REQUEST_CREATE')) {
    items.push({
      id: 'action:newRequest',
      group: tCmd('groups.actions'),
      label: tCmd('actions.newRequest'),
      keywords: ['request', 'anfrage', 'service'],
      action: 'newRequest',
      onSelect: () => onAction('newRequest'),
    });
  }
  return items;
}

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function fuzzyMatch(query: string, ...parts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}
