'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ExtensionDownloadLink } from '@/components/profile/ExtensionDownloadLink';
import { ProfilePhotoSheet } from '@/components/profile/ProfilePhotoSheet';

export default function HousekeeperProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const t = useTranslations('profile');
  const [photoOpen, setPhotoOpen] = useState(false);

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col p-4">
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        </div>

        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            className="group relative rounded-full"
            aria-label={t('changePhoto')}
          >
            <Avatar name={user?.name ?? '?'} url={user?.avatarUrl} size={112} ring />
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/0 text-[11px] font-semibold text-white opacity-0 transition group-hover:bg-ink/40 group-hover:opacity-100">
              {t('changePhoto')}
            </span>
          </button>
          <div>
            <p className="text-lg font-semibold text-ink">{user?.name}</p>
            <p className="text-xs text-ink-muted">{user?.email}</p>
          </div>
          <Button variant="secondary" onClick={() => setPhotoOpen(true)}>
            {t('updatePhoto')}
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
      </div>

      <footer className="mt-auto pt-8">
        <ExtensionDownloadLink />
      </footer>

      <ProfilePhotoSheet open={photoOpen} onClose={() => setPhotoOpen(false)} />
    </div>
  );
}
