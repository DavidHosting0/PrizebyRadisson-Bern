/** Cookie jar for Mirus NEO HTTP login (Set-Cookie → Cookie header). */
export type MirusStoredCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

export class MirusCookieJar {
  private readonly store = new Map<string, MirusStoredCookie>();

  private key(c: MirusStoredCookie): string {
    return `${c.domain ?? ''}|${c.path ?? '/'}|${c.name}`;
  }

  ingestSetCookie(headers: string[], requestUrl: URL) {
    for (const line of headers) {
      const part = line.split(';')[0]?.trim();
      if (!part || !part.includes('=')) continue;
      const eq = part.indexOf('=');
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      if (!name) continue;

      let domain = requestUrl.hostname;
      let path = '/';
      let expired = false;
      for (const attr of line.split(';').slice(1)) {
        const [rawK, ...rest] = attr.trim().split('=');
        const k = rawK ?? '';
        const v = rest.join('=');
        if (/^domain$/i.test(k) && v) domain = v.replace(/^\./, '').trim();
        if (/^path$/i.test(k) && v) path = v.trim();
        if (/^max-age$/i.test(k) && v !== undefined) {
          const n = Number(v);
          if (!Number.isNaN(n) && n <= 0) expired = true;
        }
        if (/^expires$/i.test(k) && v) {
          const t = Date.parse(v);
          if (!Number.isNaN(t) && t <= Date.now()) expired = true;
        }
      }

      const entry: MirusStoredCookie = { name, value, domain, path };
      if (expired || value === '') {
        this.store.delete(this.key(entry));
        continue;
      }
      this.store.set(this.key(entry), entry);
    }
  }

  headerFor(url: URL): string {
    const host = url.hostname;
    const path = url.pathname;
    const parts: string[] = [];
    for (const c of this.store.values()) {
      if (c.domain && c.domain !== host && !host.endsWith(`.${c.domain}`)) continue;
      const cookiePath = c.path ?? '/';
      if (
        cookiePath !== '/' &&
        path !== cookiePath &&
        !path.startsWith(cookiePath.endsWith('/') ? cookiePath : `${cookiePath}/`)
      ) {
        continue;
      }
      parts.push(`${c.name}=${c.value}`);
    }
    return parts.join('; ');
  }

  /** True when a real signed-in session cookie is present. */
  hasAuthCookie(): boolean {
    for (const c of this.store.values()) {
      if (!c.value) continue;
      const n = c.name;
      // Mirus NEO auth cookie (confirmed via browser login HAR + live probe)
      if (/^mirusWeb$/i.test(n)) return true;
      if (/^Identity\.External$/i.test(n)) continue;
      if (/Antiforgery/i.test(n)) continue;
      if (/ARRAffinity/i.test(n)) continue;
      if (/Culture/i.test(n)) continue;
      if (
        /\.AspNetCore\.Identity/i.test(n) ||
        /\.AspNetCore\.Cookies/i.test(n) ||
        /\.AspNetCore\.Session/i.test(n)
      ) {
        return true;
      }
    }
    return false;
  }

  cookieNames(): string[] {
    return [...this.store.values()].map((c) => c.name);
  }

  toJSON(): MirusStoredCookie[] {
    return [...this.store.values()];
  }

  static fromJSON(cookies: MirusStoredCookie[]): MirusCookieJar {
    const jar = new MirusCookieJar();
    for (const c of cookies) {
      if (!c.value) continue;
      jar.store.set(jar.key(c), c);
    }
    return jar;
  }
}
