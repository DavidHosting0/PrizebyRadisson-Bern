'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

type U = { id: string; email: string; name: string; role: string; isActive: boolean };

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.role !== 'ADMIN') router.replace('/');
  }, [user, loading, router]);

  const { data } = useQuery({
    queryKey: ['users'],
    enabled: user?.role === 'ADMIN',
    queryFn: () => api<U[]>('/users'),
  });

  if (loading || !user) return <p className="p-4">Loading…</p>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Admin · Users</h1>
      <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {data?.map((u) => (
          <li key={u.id} className="px-3 py-2 text-sm">
            <span className="font-medium">{u.name}</span>{' '}
            <span className="text-slate-500">
              {u.email} · {u.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
