'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function HousekeeperProfilePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">Signed in as housekeeper</p>
      </div>
      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Name</p>
        <p className="mt-1 text-lg font-medium text-ink">{user?.name}</p>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-muted">Email</p>
        <p className="mt-1 text-sm text-ink">{user?.email}</p>
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
  );
}
