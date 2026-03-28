'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

type U = { id: string; email: string; name: string; role: string; isActive: boolean };

export default function AdminPage() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['users'],
    enabled: user?.role === 'ADMIN',
    queryFn: () => api<U[]>('/users'),
  });

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Users</h1>
        <p className="mt-1 text-sm text-ink-muted">Admin · directory</p>
      </div>
      <ul className="space-y-2">
        {data?.map((u) => (
          <li key={u.id}>
            <Card className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{u.name}</span>
              <span className="text-sm text-ink-muted">
                {u.email} · {u.role}
                {!u.isActive && <span className="ml-2 text-danger">Inactive</span>}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
