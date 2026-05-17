/** Minimal cookie jar for EMMA HTTP login (Set-Cookie → Cookie header). */
export type StoredCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

export class EmmaCookieJar {
  private readonly store = new Map<string, StoredCookie>();

  private key(c: StoredCookie): string {
    return `${c.domain ?? ''}|${c.path ?? '/'}|${c.name}`;
  }

  set(name: string, value: string, url: URL) {
    this.store.set(this.key({ name, value, domain: url.hostname, path: '/' }), {
      name,
      value,
      domain: url.hostname,
      path: '/',
    });
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
      this.store.set(this.key({ name, value, domain, path }), { name, value, domain, path });
    }
  }

  headerFor(url: URL): string {
    const host = url.hostname;
    const parts: string[] = [];
    for (const c of this.store.values()) {
      if (c.domain && c.domain !== host && !host.endsWith(`.${c.domain}`)) continue;
      parts.push(`${c.name}=${c.value}`);
    }
    return parts.join('; ');
  }

  toJSON(): StoredCookie[] {
    return [...this.store.values()];
  }

  static fromJSON(cookies: StoredCookie[]): EmmaCookieJar {
    const jar = new EmmaCookieJar();
    for (const c of cookies) {
      jar.store.set(jar.key(c), c);
    }
    return jar;
  }
}
