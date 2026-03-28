'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('housekeeper@demo.local');
  const [password, setPassword] = useState('Password123!');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
        setErr(
          'Cannot reach the API. Set NEXT_PUBLIC_API_URL to this site’s public API base and rebuild the web app.',
        );
      } else {
        setErr('Login failed. Check email and password.');
      }
    } finally {
      setPending(false);
    }
  }

  const field =
    'mt-2 w-full min-h-[48px] rounded-btn border border-border bg-surface px-3 py-2.5 text-base text-ink shadow-card focus:border-ink/30 focus:outline-none focus:ring-2 focus:ring-ink/10';

  return (
    <div className="flex min-h-screen flex-col justify-center bg-surface-muted px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandLogo />
        </div>
        <Card>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Housekeeping operations</p>
          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-medium text-ink">Email</label>
              <input
                className={field}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Password</label>
              <input
                className={field}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="primary" fullWidth disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
