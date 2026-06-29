'use client';

import Image from 'next/image';
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
    'mt-2 w-full min-h-[48px] rounded-lg border border-sidebar-border bg-white/5 px-4 py-3 text-base text-white shadow-sm transition placeholder:text-sidebar-muted/70 focus:border-white/25 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/10';

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <section className="relative h-44 shrink-0 overflow-hidden lg:hidden">
        <Image
          src="/login-hotel.png"
          alt=""
          fill
          priority
          className="object-cover object-[center_35%]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/50 to-transparent" aria-hidden />
      </section>

      <section className="relative hidden min-h-screen overflow-hidden lg:flex lg:w-[44%] xl:w-[42%]">
        <Image
          src="/login-hotel.png"
          alt="Prize by Radisson Bern"
          fill
          priority
          className="object-cover object-center"
          sizes="(min-width: 1024px) 44vw, 0px"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/75 to-sidebar/35"
          aria-hidden
        />
        <div className="relative z-10 flex min-h-screen flex-col justify-between px-10 py-10 xl:px-12 xl:py-12">
          <BrandLogo link={false} className="brightness-0 invert" />
          <div>
            <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
              {t('title')}
            </h2>
            <p className="mt-4 max-w-sm text-base leading-relaxed text-sidebar-muted">
              {t('subtitle')}
            </p>
          </div>
          <p className="text-xs text-sidebar-muted/80">{t('secureNote')}</p>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col bg-sidebar lg:min-h-screen">
        <div className="border-b border-sidebar-border px-6 py-4 lg:hidden">
          <BrandLogo link={false} className="mx-auto brightness-0 invert" />
        </div>

        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-20">
          <div className="mx-auto w-full max-w-[400px]">
            <p className="mb-6 text-center text-sm font-semibold uppercase tracking-[0.14em] text-sidebar-muted lg:text-left">
              {tCommon('beta')}
            </p>

            <div className="mb-8 lg:mb-10">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
                {t('signIn')}
              </h1>
              <p className="mt-2 text-sm text-sidebar-muted">{t('welcomeBack')}</p>
            </div>

            <form className="space-y-5" onSubmit={onSubmit}>
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-sidebar-muted">
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
                <label htmlFor="password" className="block text-sm font-medium text-sidebar-muted">
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
                <label className="flex cursor-pointer items-center gap-2.5 text-sidebar-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-sidebar-border bg-white/5 accent-action"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  {t('rememberMe')}
                </label>
                <span className="text-sidebar-muted/70">Contact admin for access</span>
              </div>

              {err && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-red-200">
                  {err}
                </p>
              )}

              <Button type="submit" variant="action" fullWidth disabled={pending} className="mt-2 min-h-[50px]">
                {pending ? t('signingIn') : t('signIn')}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-sidebar-muted lg:text-left">
              <a
                href="/install-help"
                className="font-medium text-sidebar-muted underline underline-offset-2 transition hover:text-white"
              >
                App auf dem Handy installieren
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
