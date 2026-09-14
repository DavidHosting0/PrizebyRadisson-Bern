import { FormEvent, useEffect, useRef, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/i18n';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '@/lib/storage';

/** Chrome Password Manager / Credential Management — best-effort on extension pages. */
async function storeChromeCredential(email: string, password: string) {
  try {
    const PasswordCred = (
      window as unknown as {
        PasswordCredential?: new (data: {
          id: string;
          password: string;
          name?: string;
        }) => Credential;
      }
    ).PasswordCredential;
    if (!PasswordCred || !navigator.credentials?.store) return;
    const cred = new PasswordCred({ id: email, password, name: email });
    await navigator.credentials.store(cred);
  } catch {
    // Not supported or user dismissed — ignore
  }
}

async function readChromeCredential(): Promise<{ email: string; password: string } | null> {
  try {
    if (!navigator.credentials?.get) return null;
    const cred = (await navigator.credentials.get({
      password: true,
      mediation: 'optional',
    } as CredentialRequestOptions)) as (Credential & { id?: string; password?: string }) | null;
    if (!cred?.id || typeof cred.password !== 'string') return null;
    return { email: cred.id, password: cred.password };
  } catch {
    return null;
  }
}

export function LoginForm() {
  const { login } = useAuth();
  const { m } = useI18n();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Let Chrome autofill paint first, then fill gaps.
      await new Promise((r) => window.setTimeout(r, 50));
      if (cancelled) return;

      const fromManager = await readChromeCredential();
      if (cancelled) return;
      if (fromManager && emailRef.current && passwordRef.current) {
        if (!emailRef.current.value) emailRef.current.value = fromManager.email;
        if (!passwordRef.current.value) passwordRef.current.value = fromManager.password;
      }

      const stored = await storageGet([STORAGE_KEYS.rememberEmail]);
      if (cancelled) return;
      if (stored.rememberEmail) {
        setRemember(true);
        if (emailRef.current && !emailRef.current.value) {
          emailRef.current.value = stored.rememberEmail;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const email = (emailRef.current?.value || '').trim();
    const password = passwordRef.current?.value || '';
    try {
      await login(email, password);
      void storeChromeCredential(email, password);
      if (remember) {
        await storageSet({ [STORAGE_KEYS.rememberEmail]: email });
      } else {
        await storageRemove([STORAGE_KEYS.rememberEmail]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
        setErr(m.auth.networkError);
      } else {
        setErr(m.auth.loginFailed);
      }
    } finally {
      setPending(false);
    }
  }

  const field =
    'mt-1 w-full min-h-[34px] rounded-md border border-sidebar-border bg-white/95 px-2.5 py-1.5 text-xs text-ink transition placeholder:text-ink-muted/45 focus:border-action/40 focus:outline-none focus:ring-1 focus:ring-action/30';

  return (
    <div className="flex flex-1 flex-col bg-sidebar px-3 py-4">
      <BrandLogo className="mb-3" onDark />
      <h1 className="text-sm font-semibold text-white">{m.auth.signIn}</h1>

      {/*
        Uncontrolled inputs + name/autocomplete help Chrome Password Manager.
        Controlled React values often block autofill detection.
      */}
      <form
        className="mt-3 space-y-2.5"
        method="post"
        action="#"
        autoComplete="on"
        onSubmit={(e) => void onSubmit(e)}
      >
        <div>
          <label htmlFor="username" className="block text-[11px] font-medium text-sidebar-muted">
            {m.auth.email}
          </label>
          <input
            ref={emailRef}
            id="username"
            name="username"
            className={field}
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-[11px] font-medium text-sidebar-muted">
            {m.auth.password}
          </label>
          <input
            ref={passwordRef}
            id="password"
            name="password"
            className={field}
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-sidebar-muted">
          <input
            type="checkbox"
            name="remember"
            className="h-3.5 w-3.5 rounded border-border accent-ink"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {m.auth.rememberMe}
        </label>

        {err && (
          <p className="rounded-md border border-danger/15 bg-danger-muted px-2 py-1.5 text-[11px] text-danger">
            {err}
          </p>
        )}

        <Button type="submit" variant="action" fullWidth disabled={pending}>
          {pending ? m.auth.signingIn : m.auth.signIn}
        </Button>
      </form>
    </div>
  );
}
