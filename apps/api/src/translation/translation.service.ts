import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  isSupportedLocale,
  localeLangName,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from '@housekeeping/shared';
import { SettingsService } from '../settings/settings.service';
import {
  type MentionForPlaceholder,
  shieldMentions,
  unshieldMentions,
} from './mention-placeholders';

export type ChatTranslateItem = {
  id: string;
  body: string;
  mentions: MentionForPlaceholder[];
  sourceLocale?: string | null;
};

export type ChatTranslateResult = {
  body: string;
  sourceLocale: SupportedLocale | null;
};

@Injectable()
export class TranslationService {
  private readonly log = new Logger(TranslationService.name);
  private liveInFlight = 0;
  private readonly liveWaiters: Array<() => void> = [];
  /** After OpenAI 429, skip live calls until this timestamp. */
  private rateLimitedUntil = 0;
  private static readonly MAX_LIVE = 2;
  private static readonly LIVE_WAIT_MS = 8_000;
  /** Max messages per OpenAI request (RPD saver). */
  private static readonly BATCH_SIZE = 10;
  /** Minimum cooldown after a 429 (rolling RPD frees slowly). */
  private static readonly MIN_RATE_LIMIT_COOLDOWN_MS = 45_000;

  constructor(private readonly settings: SettingsService) {}

  /** True while OpenAI daily/minute quota is exhausted. */
  isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  private tripRateLimit(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/429|rate limit/i.test(msg)) return;
    const m = /try again in ([\d.]+)\s*s/i.exec(msg);
    const fromMsgMs = m ? Math.ceil(parseFloat(m[1]) * 1000) : 60_000;
    // RPD exhaustion often advertises a few seconds until *one* slot frees —
    // back off longer so polls don't burn the remaining budget one-by-one.
    const cooldown = Math.max(
      fromMsgMs * 3,
      TranslationService.MIN_RATE_LIMIT_COOLDOWN_MS,
    );
    this.rateLimitedUntil = Math.max(this.rateLimitedUntil, Date.now() + cooldown);
    this.log.warn(
      `OpenAI rate limit — pausing chat translations for ${Math.ceil(cooldown / 1000)}s`,
    );
  }

  private async client(): Promise<{ openai: OpenAI; model: string } | null> {
    const cfg = await this.settings.getAiConfigSecrets();
    if (!cfg?.openaiApiKey) return null;
    return {
      openai: new OpenAI({ apiKey: cfg.openaiApiKey, timeout: 20_000, maxRetries: 0 }),
      model: cfg.openaiModel ?? 'gpt-4o-mini',
    };
  }

  private async acquireLiveSlot(): Promise<boolean> {
    if (this.isRateLimited()) return false;
    if (this.liveInFlight < TranslationService.MAX_LIVE) {
      this.liveInFlight += 1;
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const idx = this.liveWaiters.indexOf(wake);
        if (idx >= 0) this.liveWaiters.splice(idx, 1);
        resolve(false);
      }, TranslationService.LIVE_WAIT_MS);
      const wake = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.isRateLimited()) {
          resolve(false);
          return;
        }
        this.liveInFlight += 1;
        resolve(true);
      };
      this.liveWaiters.push(wake);
    });
  }

  private releaseLiveSlot(): void {
    this.liveInFlight = Math.max(0, this.liveInFlight - 1);
    const next = this.liveWaiters.shift();
    if (next) next();
  }

  /**
   * Lightweight locale guess for short chat messages.
   * Returns null when uncertain — callers must NOT treat uncertain text as English
   * (that skipped translation whenever the UI language was English).
   */
  detectLocale(text: string): SupportedLocale | null {
    const sample = text.trim().slice(0, 500);
    if (!sample) return null;

    const deHints =
      /\b(und|oder|nicht|ist|sind|zimmer|bitte|danke|guten|hallo|abend|abreise|anreise|schmutzig|sauber|heute|morgen|für|mit|auch|noch|schon|kann|keine|der|die|das|ein|eine|wir|ihr)\b/i;
    const enHints =
      /\b(and|or|not|is|are|room|please|thanks|thank|hello|morning|departure|arrival|dirty|clean|this|that|have|has|need|needs|guest|floor|the|with)\b/i;
    const ptHints =
      /\b(não|nao|são|sao|quarto|obrigado|obrigada|olá|ola|bom dia|partida|chegada|sujo|limpo|pelo|pela|por favor)\b/i;
    const esHints =
      /\b(habitación|habitacion|gracias|hola|mañana|manana|salida|llegada|sucio|limpio|por favor|buenos|buenas|está|estan|están|también|tambien)\b/i;
    const trHints =
      /\b(veya|değil|degil|oda|lütfen|lutfen|teşekkür|tesekkur|teşekkürler|tesekkurler|merhaba|sabah|çıkış|cikis|giriş|giris|kirli|temiz|için|icin|yok|gibi|tamam|evet|hayır|hayir|misafir|kat|bugün|bugun|yarın|yarin|günaydın|gunaydin|günler|gunler)\b/i;
    const ukHints =
      /\b(і|та|або|не|є|кімната|кімнати|будь ласка|дякую|привіт|ранок|виїзд|заїзд|брудний|чистий|добрий|день)\b/i;

    const scores: Record<SupportedLocale, number> = {
      de: (sample.match(deHints) ?? []).length,
      en: (sample.match(enHints) ?? []).length,
      pt: (sample.match(ptHints) ?? []).length,
      es: (sample.match(esHints) ?? []).length,
      tr: (sample.match(trHints) ?? []).length,
      uk: (sample.match(ukHints) ?? []).length,
    };

    // Strong character signals outweigh weak function-word hits.
    if (/[ієїґ]/i.test(sample) || /[а-яА-ЯіІїЇєЄґҐ]{3,}/.test(sample)) scores.uk += 3;
    if (/[ğüşöçıİĞÜŞÖÇ]/.test(sample)) scores.tr += 3;
    if (/[ãõ]/.test(sample)) scores.pt += 2;
    if (/[äöüß]/i.test(sample)) scores.de += 2;
    if (/[ñ¿¡]/.test(sample)) scores.es += 2;

    const best = Math.max(...Object.values(scores));
    if (best === 0) {
      if (/[ієїґ]/i.test(sample) || /[а-яА-Я]{3,}/.test(sample)) return 'uk';
      if (/[ğüşöçıİĞÜŞÖÇ]/.test(sample)) return 'tr';
      if (/[ãõ]/.test(sample)) return 'pt';
      if (/[äöüß]/i.test(sample)) return 'de';
      if (/[ñ¿¡]/.test(sample)) return 'es';
      // Uncertain — do not guess "en" (breaks EN UI translation).
      return null;
    }

    // Prefer distinctive locales when scores tie.
    const order: SupportedLocale[] = ['uk', 'tr', 'es', 'pt', 'de', 'en'];
    for (const locale of order) {
      if (scores[locale] === best) return locale;
    }
    return null;
  }

  async translateChatBody(
    body: string,
    targetLocale: SupportedLocale,
    mentions: MentionForPlaceholder[],
    sourceLocale?: string | null,
  ): Promise<ChatTranslateResult | null> {
    const map = await this.translateChatBodies(
      [{ id: '_', body, mentions, sourceLocale }],
      targetLocale,
    );
    return map.get('_') ?? null;
  }

  /**
   * Translate many chat bodies in as few OpenAI calls as possible (batched JSON).
   * Returns only successful translations; skipped / failed ids are omitted.
   */
  async translateChatBodies(
    items: ChatTranslateItem[],
    targetLocale: SupportedLocale,
  ): Promise<Map<string, ChatTranslateResult>> {
    const out = new Map<string, ChatTranslateResult>();
    if (items.length === 0) return out;

    if (this.isRateLimited()) {
      this.log.warn('chat translation skipped: OpenAI rate-limit cooldown');
      return out;
    }

    const needApi: Array<{
      id: string;
      shielded: string;
      original: string;
      mentions: MentionForPlaceholder[];
      detected: SupportedLocale | null;
    }> = [];

    for (const item of items) {
      const body = item.body;
      if (!body.trim()) continue;
      const fromArg = isSupportedLocale(item.sourceLocale) ? item.sourceLocale : null;
      const detected = fromArg ?? this.detectLocale(body);
      if (detected === targetLocale) {
        out.set(item.id, { body, sourceLocale: detected });
        continue;
      }
      needApi.push({
        id: item.id,
        shielded: shieldMentions(body, item.mentions),
        original: body,
        mentions: item.mentions,
        detected,
      });
    }

    if (needApi.length === 0) return out;

    const ctx = await this.client();
    if (!ctx) return out;

    const gotSlot = await this.acquireLiveSlot();
    if (!gotSlot) {
      this.log.warn('chat translation skipped: live slot timeout or rate limit');
      return out;
    }

    try {
      for (let i = 0; i < needApi.length; i += TranslationService.BATCH_SIZE) {
        if (this.isRateLimited()) break;
        const chunk = needApi.slice(i, i + TranslationService.BATCH_SIZE);
        const translated = await this.translateChunk(ctx, chunk, targetLocale);
        for (const [id, result] of translated) {
          out.set(id, result);
        }
      }
    } finally {
      this.releaseLiveSlot();
    }

    return out;
  }

  private async translateChunk(
    ctx: { openai: OpenAI; model: string },
    chunk: Array<{
      id: string;
      shielded: string;
      original: string;
      mentions: MentionForPlaceholder[];
      detected: SupportedLocale | null;
    }>,
    targetLocale: SupportedLocale,
  ): Promise<Map<string, ChatTranslateResult>> {
    const out = new Map<string, ChatTranslateResult>();
    const langName = localeLangName(targetLocale);
    const payload: Record<string, string> = {};
    for (const row of chunk) {
      payload[row.id] = row.shielded;
    }

    try {
      const res = await ctx.openai.chat.completions.create({
        model: ctx.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `You translate hotel staff chat messages to ${langName}. ` +
              `Input is a JSON object: message id → original text. ` +
              `Return a JSON object with the same ids → translated text. ` +
              `Always translate when the source is another language. ` +
              `Only keep text unchanged when it is already clearly in ${langName}. ` +
              'Keep {{MENTION:...}} tokens exactly as-is. No commentary.',
          },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      });
      const raw = res.choices[0]?.message?.content?.trim();
      if (!raw) return out;

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.log.warn('chat batch translation: invalid JSON response');
        return out;
      }

      const byId = new Map(chunk.map((c) => [c.id, c]));
      for (const [id, value] of Object.entries(parsed)) {
        const row = byId.get(id);
        if (!row || typeof value !== 'string') continue;
        const translated = value.trim();
        if (!translated) continue;
        const body = unshieldMentions(translated, row.mentions);
        if (body === row.original.trim()) {
          if (row.detected === targetLocale) {
            out.set(id, { body: row.original, sourceLocale: row.detected });
          }
          continue;
        }
        out.set(id, { body, sourceLocale: row.detected });
      }
    } catch (e) {
      this.tripRateLimit(e);
      this.log.warn(`chat translation failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    return out;
  }

  /**
   * One OpenAI call → translations for every UI locale (except confident source).
   * Intended for message-create prefetch so list polls hit the DB cache only.
   */
  async translateChatBodyToAllLocales(
    body: string,
    mentions: MentionForPlaceholder[],
    sourceLocale?: string | null,
  ): Promise<{ sourceLocale: SupportedLocale | null; byLocale: Map<SupportedLocale, string> }> {
    const byLocale = new Map<SupportedLocale, string>();
    const trimmed = body.trim();
    if (!trimmed) {
      return { sourceLocale: null, byLocale };
    }

    const detected =
      (isSupportedLocale(sourceLocale) ? sourceLocale : null) ?? this.detectLocale(body);
    const targets = SUPPORTED_LOCALES.filter((locale) => locale !== detected);
    if (targets.length === 0) {
      return { sourceLocale: detected, byLocale };
    }

    if (this.isRateLimited()) {
      this.log.warn('chat multi-locale translation skipped: OpenAI rate-limit cooldown');
      return { sourceLocale: detected, byLocale };
    }

    const ctx = await this.client();
    if (!ctx) return { sourceLocale: detected, byLocale };

    const gotSlot = await this.acquireLiveSlot();
    if (!gotSlot) {
      this.log.warn('chat multi-locale translation skipped: live slot timeout or rate limit');
      return { sourceLocale: detected, byLocale };
    }

    const shielded = shieldMentions(body, mentions);
    const targetNames = targets.map((locale) => `${locale}=${localeLangName(locale)}`).join(', ');

    try {
      const res = await ctx.openai.chat.completions.create({
        model: ctx.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `Translate one hotel staff chat message into multiple languages. ` +
              `Return a JSON object with keys: ${targets.join(', ')}. ` +
              `Language names: ${targetNames}. ` +
              `Each key MUST contain only that language (e.g. "en" = English only, "de" = German only). ` +
              `Do not put German text into non-German keys. ` +
              `Always translate when the source is another language. ` +
              'Keep {{MENTION:...}} tokens exactly as-is. No commentary.',
          },
          { role: 'user', content: shielded },
        ],
      });
      const raw = res.choices[0]?.message?.content?.trim();
      if (!raw) return { sourceLocale: detected, byLocale };

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        this.log.warn('chat multi-locale translation: invalid JSON response');
        return { sourceLocale: detected, byLocale };
      }

      for (const locale of targets) {
        const value = parsed[locale];
        if (typeof value !== 'string') continue;
        const translated = unshieldMentions(value.trim(), mentions);
        if (!translated || translated === trimmed) continue;
        // Drop clearly wrong-language buckets (e.g. German text stored under "en").
        const outLang = this.detectLocale(translated);
        if (outLang && outLang !== locale && !(outLang === detected)) {
          this.log.warn(
            `chat multi-locale: dropped ${locale} result (looks like ${outLang})`,
          );
          continue;
        }
        byLocale.set(locale, translated);
      }
    } catch (e) {
      this.tripRateLimit(e);
      this.log.warn(
        `chat multi-locale translation failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.releaseLiveSlot();
    }

    return { sourceLocale: detected, byLocale };
  }
}
