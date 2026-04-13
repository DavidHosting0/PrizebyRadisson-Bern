'use client';

import Link from 'next/link';
import { TeamChatView } from '@/components/team-chat/TeamChatView';
import { IconUser } from '@/components/icons';

export default function HousekeeperChatPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Team chat</h1>
          <p className="text-xs text-ink-muted">Cleaners, supervisors & reception</p>
        </div>
        <Link
          href="/h/profile"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-ink-muted shadow-card transition-colors hover:border-action/30 hover:text-ink"
          aria-label="Profile"
        >
          <IconUser className="h-[18px] w-[18px]" />
        </Link>
      </div>
      <TeamChatView className="min-h-0 flex-1" />
    </div>
  );
}
