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
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await login(email, password);
      if (remember && typeof window !== 'undefined') {
        localStorage.setItem('hk_remember_email', email);
      } else {
        localStorage.removeItem('hk_remember_email');
      }
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

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('hk_remember_email') : null;
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  const field =
    'mt-2 w-full min-h-[48px] rounded-btn border border-border bg-surface px-3 py-2.5 text-base text-ink shadow-card focus:border-action/40 focus:outline-none focus:ring-2 focus:ring-action/15';

  return (
    <div className="relative flex min-h-screen flex-col justify-center bg-surface-muted px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.06),_transparent_50%),radial-gradient(ellipse_at_bottom,_rgba(43,43,43,0.04),_transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-md">
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-ink-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-action"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>
              <span className="text-ink-muted/70">Forgot password? · Contact admin</span>
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            <Button type="submit" variant="action" fullWidth disabled={pending}>
              {pending ? 'Signing in…' : 'Login'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
