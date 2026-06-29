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
      for (const attr of line.split(';').slice(1)) {
        const [k, v] = attr.trim().split('=');
        if (/^domain$/i.test(k) && v) domain = v.replace(/^\./, '').trim();
        if (/^path$/i.test(k) && v) path = v.trim();
      }
      this.store.set(this.key({ name, value, domain, path }), {
        name,
        value,
        domain,
        path,
      });
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

  hasAuthCookie(): boolean {
    for (const c of this.store.values()) {
      if (/Identity|Auth|Session/i.test(c.name) && c.value && c.value !== '') {
        return true;
      }
    }
    return false;
  }

  toJSON(): MirusStoredCookie[] {
    return [...this.store.values()];
  }

  static fromJSON(cookies: MirusStoredCookie[]): MirusCookieJar {
    const jar = new MirusCookieJar();
    for (const c of cookies) {
      jar.store.set(jar.key(c), c);
    }
    return jar;
  }
}
