'use client';

import { useTranslations } from 'next-intl';
import type { NavItem } from '@/lib/permission-routes';

export function useTranslatedNav<T extends NavItem>(nav: T[]): (T & { label: string })[] {
  const t = useTranslations('nav');
  return nav.map((item) => ({
    ...item,
    label: t(item.labelKey),
  }));
}
