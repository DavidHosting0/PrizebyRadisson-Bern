'use client';

import Link from 'next/link';
import { TeamChatView } from '@/components/team-chat/TeamChatView';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/lib/auth-context';

export default function HousekeeperChatPage() {
  const { user } = useAuth();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Team chat</h1>
          <p className="text-xs text-ink-muted">Cleaners, supervisors & reception</p>
        </div>
        <Link
          href="/h/profile"
          className="rounded-full transition-transform hover:scale-[1.03]"
          aria-label="Open your profile"
        >
          <Avatar name={user?.name ?? '?'} url={user?.avatarUrl} size={36} ring />
        </Link>
      </div>
      <TeamChatView className="min-h-0 flex-1" />
    </div>
  );
}
