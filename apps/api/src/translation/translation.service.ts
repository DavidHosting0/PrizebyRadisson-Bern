import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { isSupportedLocale, type SupportedLocale } from '@housekeeping/shared';
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
    const deScore = (sample.match(deHints) ?? []).length;
    const enScore = (sample.match(enHints) ?? []).length;
    const ptScore = (sample.match(ptHints) ?? []).length;
    const best = Math.max(deScore, enScore, ptScore);
    if (best === 0) {
      if (/[äöüß]/i.test(sample)) return 'de';
      if (/[ãõáàâêéíóôúç]/i.test(sample)) return 'pt';
      return 'en';
    }
    if (ptScore === best) return 'pt';
    if (enScore === best) return 'en';
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
    const langName =
      targetLocale === 'en' ? 'English' : targetLocale === 'pt' ? 'Portuguese' : 'German';

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
