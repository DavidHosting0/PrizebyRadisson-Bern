'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui/Button';

const REMEMBER_KEY = 'hk_remember_username';
const LEGACY_REMEMBER_KEY = 'hk_remember_email';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  useEffect(() => {
    const saved =
      typeof window !== 'undefined'
        ? localStorage.getItem(REMEMBER_KEY) ?? localStorage.getItem(LEGACY_REMEMBER_KEY)
        : null;
    if (saved) {
      setUsername(saved);
      setRemember(true);
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await login(username.trim(), password);
      if (remember && typeof window !== 'undefined') {
        localStorage.setItem(REMEMBER_KEY, username.trim());
        localStorage.removeItem(LEGACY_REMEMBER_KEY);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
        localStorage.removeItem(LEGACY_REMEMBER_KEY);
      }
      router.replace('/');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
        setErr(t('networkError'));
      } else {
        setErr(t('loginFailed'));
      }
    } finally {
      setPending(false);
    }
  }

  const field =
    'mt-2 w-full min-h-[48px] rounded-lg border border-border bg-surface-muted/60 px-4 py-3 text-base text-ink shadow-card transition placeholder:text-ink-muted/45 focus:border-ink/20 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ink/8';

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <section className="relative hidden flex-col justify-between bg-[#ECECEC] px-12 py-12 lg:flex lg:w-[42%] xl:w-[38%]">
        <BrandLogo link={false} />
        <div>
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-ink xl:text-4xl">
            {t('title')}
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-ink-muted">
            {t('subtitle')}
          </p>
        </div>
        <p className="text-xs text-ink-muted/50">{t('secureNote')}</p>
      </section>

      <section className="flex flex-1 flex-col justify-center bg-surface px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-10 flex justify-center lg:hidden">
            <BrandLogo link={false} />
          </div>

          <p className="mb-6 text-center text-3xl font-bold tracking-tight text-ink sm:text-4xl lg:mb-8 lg:text-left">
            {tCommon('beta')}
          </p>

          <div className="mb-8 lg:mb-10">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{t('signIn')}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t('welcomeBack')}</p>
          </div>

          <form className="space-y-5" onSubmit={onSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-ink">
                {t('username')}
              </label>
              <input
                id="username"
                className={field}
                type="text"
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink">
                {t('password')}
              </label>
              <input
                id="password"
                className={field}
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2.5 text-ink-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border text-ink accent-ink"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                {t('rememberMe')}
              </label>
              <span className="text-ink-muted/70">Contact admin for access</span>
            </div>

            {err && (
              <p className="rounded-lg border border-danger/15 bg-danger-muted px-3 py-2.5 text-sm text-danger">
                {err}
              </p>
            )}

            <Button type="submit" variant="primary" fullWidth disabled={pending} className="mt-2 min-h-[50px]">
              {pending ? t('signingIn') : t('signIn')}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-ink-muted">
            <a href="/install-help" className="font-medium text-ink-muted underline underline-offset-2 hover:text-ink">
              App auf dem Handy installieren
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
