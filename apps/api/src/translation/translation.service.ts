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

  constructor(private readonly settings: SettingsService) {}

  private async client(): Promise<{ openai: OpenAI; model: string } | null> {
    const cfg = await this.settings.getAiConfigSecrets();
    if (!cfg?.openaiApiKey) return null;
    return {
      openai: new OpenAI({ apiKey: cfg.openaiApiKey }),
      model: cfg.openaiModel ?? 'gpt-4o-mini',
    };
  }

  /** Lightweight locale guess for short chat messages. */
  detectLocale(text: string): SupportedLocale {
    const sample = text.trim().slice(0, 500);
    if (!sample) return 'de';
    const deHints =
      /\b(und|oder|nicht|ist|sind|zimmer|bitte|danke|guten|hallo|morgen|abreise|anreise|schmutzig|sauber)\b/i;
    const enHints =
      /\b(and|or|not|is|are|room|please|thanks|hello|morning|departure|arrival|dirty|clean)\b/i;
    const ptHints =
      /\b(e|ou|não|nao|é|sao|são|quarto|por favor|obrigado|olá|ola|bom dia|partida|chegada|sujo|limpo)\b/i;
    const esHints =
      /\b(y|o|no|es|son|habitación|habitacion|por favor|gracias|hola|mañana|manana|salida|llegada|sucio|limpio)\b/i;
    const trHints =
      /\b(ve|veya|değil|degil|oda|lütfen|lutfen|teşekkür|tesekkur|merhaba|sabah|çıkış|cikis|giriş|giris|kirli|temiz)\b/i;
    const ukHints =
      /\b(і|та|або|не|є|кімната|кімнати|будь ласка|дякую|привіт|ранок|виїзд|заїзд|брудний|чистий)\b/i;

    const scores: Record<SupportedLocale, number> = {
      de: (sample.match(deHints) ?? []).length,
      en: (sample.match(enHints) ?? []).length,
      pt: (sample.match(ptHints) ?? []).length,
      es: (sample.match(esHints) ?? []).length,
      tr: (sample.match(trHints) ?? []).length,
      uk: (sample.match(ukHints) ?? []).length,
    };

    if (/[ієїґ]/i.test(sample) || /[а-яА-Я]{3,}/.test(sample)) scores.uk += 2;
    if (/[ğüşöçıİĞÜŞÖÇ]/.test(sample)) scores.tr += 2;
    if (/[ãõ]/.test(sample)) scores.pt += 2;
    if (/[äöüß]/i.test(sample)) scores.de += 2;
    if (/[ñ¿¡]/.test(sample)) scores.es += 2;

    const best = Math.max(...Object.values(scores));
    if (best === 0) {
      if (/[äöüß]/i.test(sample)) return 'de';
      if (/[ãõáàâêéíóôúç]/i.test(sample)) return 'pt';
      if (/[ієїґ]/i.test(sample)) return 'uk';
      if (/[ğüşöçıİ]/.test(sample)) return 'tr';
      if (/[ñ¿¡]/.test(sample)) return 'es';
      return 'en';
    }

    const order: SupportedLocale[] = ['uk', 'tr', 'es', 'pt', 'en', 'de'];
    for (const locale of order) {
      if (scores[locale] === best) return locale;
    }
    return 'de';
  }

  async translateChatBody(
    body: string,
    targetLocale: SupportedLocale,
    mentions: MentionForPlaceholder[],
    sourceLocale?: string | null,
  ): Promise<{ body: string; sourceLocale: SupportedLocale } | null> {
    const detected = isSupportedLocale(sourceLocale)
      ? sourceLocale
      : this.detectLocale(body);
    if (detected === targetLocale) {
      return { body, sourceLocale: detected };
    }

    const ctx = await this.client();
    if (!ctx) return null;

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
              'Keep {{MENTION:...}} tokens exactly as-is. Return only the translation.',
          },
          { role: 'user', content: shielded },
        ],
      });
      const translated = res.choices[0]?.message?.content?.trim();
      if (!translated) return null;
      return {
        body: unshieldMentions(translated, mentions),
        sourceLocale: detected,
      };
    } catch (e) {
      this.log.warn(`chat translation failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
