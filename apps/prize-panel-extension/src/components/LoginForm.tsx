import { FormEvent, useEffect, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import { Button } from './ui/Button';
import { useAuth } from '@/lib/auth-context';
import { STORAGE_KEYS, storageGet, storageRemove, storageSet } from '@/lib/storage';

const strings = {
  signIn: 'Anmelden',
  welcomeBack: 'Melde dich mit deinen PrizeBern-Zugangsdaten an.',
  email: 'E-Mail',
  password: 'Passwort',
  rememberMe: 'E-Mail merken',
  signingIn: 'Anmeldung…',
  loginFailed: 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.',
  networkError: 'Verbindung zum Server fehlgeschlagen.',
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
    'mt-1.5 w-full min-h-[44px] rounded-lg border border-border bg-surface-muted/60 px-3 py-2.5 text-sm text-ink shadow-card transition placeholder:text-ink-muted/45 focus:border-ink/20 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ink/8';

  return (
    <div className="flex flex-1 flex-col px-4 py-6">
      <div className="mb-6">
        <BrandLogo />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{strings.signIn}</h1>
      <p className="mt-1 text-sm text-ink-muted">{strings.welcomeBack}</p>

      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <div>
          <label htmlFor="panel-email" className="block text-sm font-medium text-ink">
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
          <label htmlFor="panel-password" className="block text-sm font-medium text-ink">
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

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-ink accent-ink"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          {strings.rememberMe}
        </label>

        {err && (
          <p className="rounded-lg border border-danger/15 bg-danger-muted px-3 py-2 text-sm text-danger">
            {err}
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth disabled={pending}>
          {pending ? strings.signingIn : strings.signIn}
        </Button>
      </form>
    </div>
  );
}
