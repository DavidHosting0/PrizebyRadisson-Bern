'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProfilePhotoSheet } from '@/components/profile/ProfilePhotoSheet';

export default function HousekeeperProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">Signed in as housekeeper</p>
      </div>

      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <button
          type="button"
          onClick={() => setPhotoOpen(true)}
          className="group relative rounded-full"
          aria-label="Change profile photo"
        >
          <Avatar name={user?.name ?? '?'} url={user?.avatarUrl} size={112} ring />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/0 text-[11px] font-semibold text-white opacity-0 transition group-hover:bg-ink/40 group-hover:opacity-100">
            Change photo
          </span>
        </button>
        <div>
          <p className="text-lg font-semibold text-ink">{user?.name}</p>
          <p className="text-xs text-ink-muted">{user?.email}</p>
        </div>
        <Button variant="secondary" onClick={() => setPhotoOpen(true)}>
          Update profile photo
        </Button>
      </Card>

      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          logout();
          router.replace('/login');
        }}
      >
        Sign out
      </Button>

      <ProfilePhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} />
    </div>
  );
}
