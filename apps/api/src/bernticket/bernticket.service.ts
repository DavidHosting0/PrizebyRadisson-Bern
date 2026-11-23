import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import {
  BERN_TICKET_2FA_REQUIRED,
  BT_API_BASE,
  BtApiError,
  type BtTicket,
  type BtTicketCreateBody,
} from './bernticket.types';

type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

/**
 * Server-side BernTicket client for arrival-check automation.
 * Uses the admin credentials stored in HotelSettings; never prompts for 2FA.
 */
@Injectable()
export class BernTicketService {
  private readonly logger = new Logger(BernTicketService.name);
  private tokens: TokenPair | null = null;
  private tokensEmail: string | null = null;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly settings: SettingsService) {}

  /**
   * Create a ticket with the configured admin account.
   * Throws BtApiError (incl. BERN_TICKET_2FA_REQUIRED) — callers must catch.
   */
  async createTicket(body: BtTicketCreateBody): Promise<BtTicket> {
    const access = await this.ensureAccessToken();
    return this.api<BtTicket>('/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
      accessToken: access,
    });
  }

  /** Clear cached tokens (e.g. after credential change). */
  clearSession(): void {
    this.tokens = null;
    this.tokensEmail = null;
  }

  private async ensureAccessToken(): Promise<string> {
    const secrets = await this.settings.getBernTicketLoginSecrets();
    if (!secrets?.email || !secrets.password) {
      throw new BtApiError('BernTicket-Zugangsdaten fehlen (Admin → BernTicket).', 0);
    }

    if (this.tokens && this.tokensEmail === secrets.email) {
      return this.tokens.accessToken;
    }

    return this.login(secrets.email, secrets.password);
  }

  private async login(email: string, password: string): Promise<string> {
    const res = await fetch(`${BT_API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      accessToken?: string;
      refreshToken?: string;
      error?: string;
      code?: string;
    };
    if (!res.ok || !data.accessToken || !data.refreshToken) {
      throw new BtApiError(
        data.error || 'BernTicket-Anmeldung fehlgeschlagen',
        res.status,
        data.code,
      );
    }
    this.tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
    this.tokensEmail = email.trim();
    return data.accessToken;
  }

  private async refreshAccess(): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = (async () => {
      const refresh = this.tokens?.refreshToken;
      if (!refresh) {
        this.clearSession();
        return null;
      }
      try {
        const res = await fetch(`${BT_API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          accessToken?: string;
          refreshToken?: string;
        };
        if (!res.ok || !data.accessToken) {
          this.clearSession();
          return null;
        }
        this.tokens = {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken || refresh,
        };
        return data.accessToken;
      } catch (err) {
        this.logger.warn(`BernTicket token refresh failed: ${(err as Error).message}`);
        return null;
      } finally {
        setTimeout(() => {
          this.refreshInFlight = null;
        }, 50);
      }
    })();
    return this.refreshInFlight;
  }

  private async api<T>(
    path: string,
    init: RequestInit & { accessToken?: string } = {},
  ): Promise<T> {
    const { accessToken: initialAccess, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (!headers.has('Content-Type') && rest.body && typeof rest.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    let access = initialAccess ?? this.tokens?.accessToken ?? null;
    if (access) headers.set('Authorization', `Bearer ${access}`);

    let res = await fetch(`${BT_API_BASE}${path}`, { ...rest, headers });

    if (res.status === 401) {
      access = await this.refreshAccess();
      if (!access) {
        // Re-login with stored credentials
        access = await this.ensureAccessToken();
      }
      headers.set('Authorization', `Bearer ${access}`);
      res = await fetch(`${BT_API_BASE}${path}`, { ...rest, headers });
    }

    const data = (await res.json().catch(() => ({}))) as T & {
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      const code = data.code;
      const message =
        code === BERN_TICKET_2FA_REQUIRED
          ? 'BernTicket verlangt 2FA — Ticket nicht erstellt.'
          : data.error || res.statusText || 'BernTicket-Anfrage fehlgeschlagen';
      throw new BtApiError(message, res.status, code);
    }
    return data as T;
  }
}
