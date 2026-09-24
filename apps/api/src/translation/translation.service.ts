import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  isSupportedLocale,
  localeLangName,
  type SupportedLocale,
} from '@housekeeping/shared';
import { SettingsService } from '../settings/settings.service';
import {
  type MentionForPlaceholder,
  shieldMentions,
  unshieldMentions,
} from './mention-placeholders';

@Injectable()
export class TranslationService {
  private readonly log = new Logger(TranslationService.name);
  private liveInFlight = 0;
  private readonly liveWaiters: Array<() => void> = [];
  private static readonly MAX_LIVE = 6;
  private static readonly LIVE_WAIT_MS = 12_000;

  constructor(private readonly settings: SettingsService) {}

  private async client(): Promise<{ openai: OpenAI; model: string } | null> {
    const cfg = await this.settings.getAiConfigSecrets();
    if (!cfg?.openaiApiKey) return null;
    return {
      openai: new OpenAI({ apiKey: cfg.openaiApiKey, timeout: 10_000, maxRetries: 0 }),
      model: cfg.openaiModel ?? 'gpt-4o-mini',
    };
  }

  private async acquireLiveSlot(): Promise<boolean> {
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
      /\b(und|oder|nicht|sind|zimmer|bitte|danke|guten|hallo|abend|abreise|anreise|schmutzig|sauber|heute|morgen|für|auch|noch|schon|kann|keine)\b/i;
    const enHints =
      /\b(and|or|not|are|room|please|thanks|thank|hello|morning|departure|arrival|dirty|clean|this|that|have|has|need|needs|guest|floor)\b/i;
    const ptHints =
      /\b(não|nao|são|sao|quarto|favor|obrigado|obrigada|olá|ola|bom dia|partida|chegada|sujo|limpo|para|uma|pelo|pela)\b/i;
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
  ): Promise<{ body: string; sourceLocale: SupportedLocale | null } | null> {
    const fromArg = isSupportedLocale(sourceLocale) ? sourceLocale : null;
    const detected = fromArg ?? this.detectLocale(body);

    // Only skip when we are confident the text is already in the target language.
    if (detected === targetLocale) {
      return { body, sourceLocale: detected };
    }

    const ctx = await this.client();
    if (!ctx) return null;

    const gotSlot = await this.acquireLiveSlot();
    if (!gotSlot) {
      this.log.warn('chat translation skipped: live slot timeout');
      return null;
    }

    const shielded = shieldMentions(body, mentions);
    const langName = localeLangName(targetLocale);

    try {
      const res = await ctx.openai.chat.completions.create({
        model: ctx.model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              `Translate hotel staff chat messages to ${langName}. ` +
              `If the text is already in ${langName}, return it unchanged. ` +
              'Keep {{MENTION:...}} tokens exactly as-is. Return only the translation.',
          },
          { role: 'user', content: shielded },
        ],
      });
      const translated = res.choices[0]?.message?.content?.trim();
      if (!translated) return null;

      const out = unshieldMentions(translated, mentions);
      if (out === body.trim()) {
        // Uncertain source + unchanged → likely already target.
        if (detected == null) {
          return { body, sourceLocale: targetLocale };
        }
        // Confident other language but model returned the same text → retry later.
        if (detected !== targetLocale) return null;
        return { body, sourceLocale: detected };
      }

      return {
        body: out,
        sourceLocale: detected,
      };
    } catch (e) {
      this.log.warn(`chat translation failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      this.releaseLiveSlot();
    }
  }
}
