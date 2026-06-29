import { FormEvent, useEffect, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/Button';
import { useAuth } from '@/lib/auth-context';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '@/lib/storage';

const strings = {
  signIn: 'Anmelden',
  email: 'E-Mail',
  password: 'Passwort',
  rememberMe: 'Merken',
  signingIn: '…',
  loginFailed: 'Anmeldung fehlgeschlagen.',
  networkError: 'Server nicht erreichbar.',
};

export function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    storageGet([STORAGE_KEYS.rememberEmail]).then((stored) => {
      if (stored.rememberEmail) {
        setEmail(stored.rememberEmail);
        setRemember(true);
      }
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      await login(email.trim(), password);
      if (remember) {
        await storageSet({ [STORAGE_KEYS.rememberEmail]: email.trim() });
      } else {
        await storageRemove([STORAGE_KEYS.rememberEmail]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/failed to fetch|networkerror|load failed|fetch/i.test(msg)) {
        setErr(strings.networkError);
      } else {
        setErr(strings.loginFailed);
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
      <h1 className="text-sm font-semibold text-white">{strings.signIn}</h1>

      <form className="mt-3 space-y-2.5" onSubmit={onSubmit}>
        <div>
          <label htmlFor="panel-email" className="block text-[11px] font-medium text-sidebar-muted">
            {strings.email}
          </label>
          <input
            id="panel-email"
            className={field}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="panel-password" className="block text-[11px] font-medium text-sidebar-muted">
            {strings.password}
          </label>
          <input
            id="panel-password"
            className={field}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-sidebar-muted">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border accent-ink"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {strings.rememberMe}
        </label>

        {err && (
          <p className="rounded-md border border-danger/15 bg-danger-muted px-2 py-1.5 text-[11px] text-danger">
            {err}
          </p>
        )}

        <Button type="submit" variant="action" fullWidth disabled={pending}>
          {pending ? strings.signingIn : strings.signIn}
        </Button>
      </form>
    </div>
  );
}
