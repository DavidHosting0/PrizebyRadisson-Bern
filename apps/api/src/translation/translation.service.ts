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

  /**
   * Lightweight locale guess for short chat messages.
   * Returns null when uncertain — callers must NOT treat uncertain text as English
   * (that skipped translation whenever the UI language was English).
   */
  detectLocale(text: string): SupportedLocale | null {
    const sample = text.trim().slice(0, 500);
    if (!sample) return null;

    const deHints =
      /\b(und|oder|nicht|ist|sind|zimmer|bitte|danke|guten|hallo|morgen|abend|abreise|anreise|schmutzig|sauber|heute|morgen|für|mit|auch|noch|schon|kann|wir|ihr|sie|der|die|das|ein|eine|keine)\b/i;
    const enHints =
      /\b(and|or|not|is|are|room|please|thanks|thank|hello|morning|departure|arrival|dirty|clean|the|this|that|with|have|has|need|needs|guest|floor)\b/i;
    const ptHints =
      /\b(não|nao|são|sao|quarto|favor|obrigado|obrigada|olá|ola|bom dia|partida|chegada|sujo|limpo|para|com|uma|pelo|pela)\b/i;
    const esHints =
      /\b(habitación|habitacion|gracias|hola|mañana|manana|salida|llegada|sucio|limpio|por favor|buenos|buenas|está|estan|están|también|tambien)\b/i;
    const trHints =
      /\b(ve|veya|değil|degil|oda|lütfen|lutfen|teşekkür|tesekkur|teşekkürler|tesekkurler|merhaba|sabah|çıkış|cikis|giriş|giris|kirli|temiz|için|icin|var|yok|bir|bu|şu|su|ne|mi|mı|mu|mü|ile|gibi|tamam|evet|hayır|hayir|misafir|kat|bugün|bugun|yarın|yarin|günaydın|gunaydin|iyi|günler|gunler)\b/i;
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
      // If model returned the same text and we had no confident source, treat as already target.
      if (out === body.trim() && detected == null) {
        return { body, sourceLocale: targetLocale };
      }

      return {
        body: out,
        sourceLocale: detected,
      };
    } catch (e) {
      this.log.warn(`chat translation failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
