'use client';

import { useCallback, useState } from 'react';

const STORAGE_KEY = 'hk_cmdk_recent';
const MAX_RECENT = 8;

export type RecentCommandItem = {
  id: string;
  type: string;
  label: string;
  subtitle?: string;
  href?: string;
  imageUrl?: string | null;
  action?: string;
};

function readRecent(): RecentCommandItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentCommandItem[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function useCommandRecent() {
  const [recent, setRecent] = useState<RecentCommandItem[]>(() => readRecent());

  const pushRecent = useCallback((item: RecentCommandItem) => {
    setRecent((prev) => {
      const next = [item, ...prev.filter((r) => r.id !== item.id)].slice(0, MAX_RECENT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { recent, pushRecent };
}
