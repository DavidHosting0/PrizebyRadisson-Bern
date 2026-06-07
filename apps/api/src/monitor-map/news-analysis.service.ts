import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { MonitorMapNewsAnalysis } from '@housekeeping/shared';
import { SettingsService } from '../settings/settings.service';

const ANALYSIS_SCHEMA = {
  name: 'MonitorMapNewsAnalysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summaryDe: { type: 'string' },
      urgency: { type: 'string', enum: ['critical', 'high', 'normal', 'low'] },
      categories: { type: 'array', items: { type: 'string' } },
      isBernRelevant: { type: 'boolean' },
      locationHint: { type: ['string', 'null'] },
    },
    required: ['summaryDe', 'urgency', 'categories', 'isBernRelevant', 'locationHint'],
  },
} as const;

@Injectable()
export class NewsAnalysisService {
  private readonly log = new Logger(NewsAnalysisService.name);

  constructor(private readonly settings: SettingsService) {}

  async analyzeArticle(title: string, summary: string | null): Promise<MonitorMapNewsAnalysis | null> {
    const config = await this.settings.getAiConfigSecrets();
    if (!config?.openaiApiKey) {
      this.log.debug('OpenAI not configured — skipping news analysis');
      return null;
    }

    const model = config.openaiModel || 'gpt-4o-mini';
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const teaser = summary?.slice(0, 600) ?? '';

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `Du analysierst Schweizer Nachrichten für eine Live-Karte von Bern.
Antworte auf Deutsch. Extrahiere einen Ort in der Region Bern/Kanton Bern wenn möglich (Strasse, Quartier, Gemeinde).
isBernRelevant=true wenn die Meldung Bern oder nahe Umgebung betrifft.`,
          },
          {
            role: 'user',
            content: `Titel: ${title}\nTeaser: ${teaser}`,
          },
        ],
        response_format: { type: 'json_schema', json_schema: ANALYSIS_SCHEMA },
      });

      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) return null;
      return JSON.parse(raw) as MonitorMapNewsAnalysis;
    } catch (e) {
      this.log.warn(`News AI analysis failed: ${(e as Error).message}`);
      return null;
    }
  }
}
