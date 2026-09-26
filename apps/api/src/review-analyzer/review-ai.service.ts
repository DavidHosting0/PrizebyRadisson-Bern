import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  ReviewMentionPolarity,
  ReviewPriority,
  ReviewSentiment,
  type GuestReview,
  type ReviewTopic,
} from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { CRITICAL_KEYWORDS, HIGH_KEYWORDS, REVIEW_TOPIC_TAXONOMY } from './taxonomy';
import { slugify } from './review-utils';

export type AiAspect = { text: string; topicSlug?: string };
export type AiTopicHit = {
  slug: string;
  polarity: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  evidence?: string;
};

export type AiAnalysisResult = {
  sentiment: ReviewSentiment;
  sentimentScore: number;
  summaryEn: string;
  translationEn: string | null;
  positives: AiAspect[];
  negatives: AiAspect[];
  topics: AiTopicHit[];
  suggestedNewTopics: Array<{ name: string; category: string }>;
  language: string | null;
};

function priorityFromText(text: string, hinted?: string): ReviewPriority {
  const lower = text.toLowerCase();
  if (hinted === 'CRITICAL' || CRITICAL_KEYWORDS.some((k) => lower.includes(k))) {
    return ReviewPriority.CRITICAL;
  }
  if (hinted === 'HIGH' || HIGH_KEYWORDS.some((k) => lower.includes(k))) {
    return ReviewPriority.HIGH;
  }
  if (hinted === 'LOW') return ReviewPriority.LOW;
  if (hinted === 'MEDIUM') return ReviewPriority.MEDIUM;
  return ReviewPriority.MEDIUM;
}

@Injectable()
export class ReviewAiService {
  private readonly logger = new Logger(ReviewAiService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async ensureTaxonomy(): Promise<Map<string, ReviewTopic>> {
    const map = new Map<string, ReviewTopic>();
    for (const t of REVIEW_TOPIC_TAXONOMY) {
      const row = await this.prisma.reviewTopic.upsert({
        where: { slug: t.slug },
        create: { slug: t.slug, name: t.name, category: t.category, isSystem: true },
        update: { name: t.name, category: t.category },
      });
      map.set(row.slug, row);
    }
    const extras = await this.prisma.reviewTopic.findMany();
    for (const e of extras) map.set(e.slug, e);
    return map;
  }

  async analyzeReview(review: GuestReview): Promise<AiAnalysisResult> {
    const config = await this.settings.getAiConfigSecrets();
    if (!config?.openaiApiKey) {
      return this.heuristicFallback(review);
    }
    const model = config.openaiModel || 'gpt-4o-mini';
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const topicList = REVIEW_TOPIC_TAXONOMY.map((t) => `${t.slug} (${t.category}: ${t.name})`).join(', ');

    const system = `You are a hotel guest-experience analyst for Prize by Radisson Bern-City.
Analyze guest reviews carefully. Respect negation and context (e.g. "not noisy" is NOT a noise complaint).
Extract concrete positive and negative aspects — not the whole review as one blob.
Do not invent facts. Every topic/aspect must be grounded in the review text.
Return ONLY valid JSON matching the schema.
All summary and aspect texts must be in English.
Known topic slugs: ${topicList}
You may suggest new topics only if a recurring theme is clearly present and not covered.`;

    const user = JSON.stringify({
      score: review.score,
      language: review.language,
      positiveText: review.positiveText,
      negativeText: review.negativeText,
      fullText: review.fullText,
      schema: {
        sentiment: 'POSITIVE|NEUTRAL|NEGATIVE|MIXED',
        sentimentScore: 'integer -100..100',
        summaryEn: 'string',
        translationEn: 'string|null — English translation of full review if not English',
        language: 'detected BCP47-ish code',
        positives: [{ text: 'string', topicSlug: 'optional slug' }],
        negatives: [{ text: 'string', topicSlug: 'optional slug' }],
        topics: [
          {
            slug: 'known or new-slug',
            polarity: 'POSITIVE|NEGATIVE|NEUTRAL',
            severity: 'CRITICAL|HIGH|MEDIUM|LOW optional for negatives',
            evidence: 'short quote',
          },
        ],
        suggestedNewTopics: [{ name: 'string', category: 'string' }],
      },
    });

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? '{}';
      return this.normalizeAiJson(raw, review);
    } catch (err) {
      this.logger.warn(`AI analysis failed for ${review.id}: ${(err as Error).message}`);
      return this.heuristicFallback(review);
    }
  }

  private normalizeAiJson(raw: string, review: GuestReview): AiAnalysisResult {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return this.heuristicFallback(review);
    }
    const sentimentRaw = String(parsed.sentiment ?? 'NEUTRAL').toUpperCase();
    const sentiment = (
      ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED'].includes(sentimentRaw)
        ? sentimentRaw
        : 'NEUTRAL'
    ) as ReviewSentiment;
    let sentimentScore = Number(parsed.sentimentScore);
    if (!Number.isFinite(sentimentScore)) sentimentScore = 0;
    sentimentScore = Math.max(-100, Math.min(100, Math.round(sentimentScore)));

    const mapAspects = (v: unknown): AiAspect[] => {
      if (!Array.isArray(v)) return [];
      const out: AiAspect[] = [];
      for (const a of v) {
        if (!a || typeof a !== 'object') continue;
        const o = a as Record<string, unknown>;
        const text = typeof o.text === 'string' ? o.text.trim() : '';
        if (!text) continue;
        out.push({
          text,
          topicSlug: typeof o.topicSlug === 'string' ? o.topicSlug : undefined,
        });
      }
      return out;
    };

    const topics: AiTopicHit[] = [];
    if (Array.isArray(parsed.topics)) {
      for (const t of parsed.topics) {
        if (!t || typeof t !== 'object') continue;
        const o = t as Record<string, unknown>;
        const slug = typeof o.slug === 'string' ? slugify(o.slug) : '';
        if (!slug) continue;
        const pol = String(o.polarity ?? 'NEUTRAL').toUpperCase();
        topics.push({
          slug,
          polarity: (['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(pol)
            ? pol
            : 'NEUTRAL') as AiTopicHit['polarity'],
          severity: typeof o.severity === 'string' ? (o.severity.toUpperCase() as AiTopicHit['severity']) : undefined,
          evidence: typeof o.evidence === 'string' ? o.evidence : undefined,
        });
      }
    }

    const suggestedNewTopics: Array<{ name: string; category: string }> = [];
    if (Array.isArray(parsed.suggestedNewTopics)) {
      for (const s of parsed.suggestedNewTopics) {
        if (!s || typeof s !== 'object') continue;
        const o = s as Record<string, unknown>;
        if (typeof o.name === 'string' && o.name.trim()) {
          suggestedNewTopics.push({
            name: o.name.trim(),
            category: typeof o.category === 'string' ? o.category : 'Other',
          });
        }
      }
    }

    return {
      sentiment,
      sentimentScore,
      summaryEn:
        typeof parsed.summaryEn === 'string' && parsed.summaryEn.trim()
          ? parsed.summaryEn.trim()
          : 'Guest feedback recorded.',
      translationEn: typeof parsed.translationEn === 'string' ? parsed.translationEn : null,
      positives: mapAspects(parsed.positives),
      negatives: mapAspects(parsed.negatives),
      topics,
      suggestedNewTopics,
      language: typeof parsed.language === 'string' ? parsed.language : review.language,
    };
  }

  private heuristicFallback(review: GuestReview): AiAnalysisResult {
    const score = review.score;
    let sentiment: ReviewSentiment = ReviewSentiment.NEUTRAL;
    let sentimentScore = 0;
    if (score >= 8) {
      sentiment = ReviewSentiment.POSITIVE;
      sentimentScore = Math.round((score - 5) * 20);
    } else if (score <= 5) {
      sentiment = ReviewSentiment.NEGATIVE;
      sentimentScore = Math.round((score - 5) * 20);
    }
    if (review.positiveText && review.negativeText) {
      sentiment = ReviewSentiment.MIXED;
    }
    const positives: AiAspect[] = review.positiveText
      ? [{ text: review.positiveText.slice(0, 200) }]
      : [];
    const negatives: AiAspect[] = review.negativeText
      ? [{ text: review.negativeText.slice(0, 200) }]
      : [];
    return {
      sentiment,
      sentimentScore,
      summaryEn: `Guest scored ${score}/10.`,
      translationEn: null,
      positives,
      negatives,
      topics: [],
      suggestedNewTopics: [],
      language: review.language,
    };
  }

  async persistAnalysis(reviewId: string, result: AiAnalysisResult, model: string | null) {
    const topicMap = await this.ensureTaxonomy();

    for (const s of result.suggestedNewTopics) {
      const slug = slugify(s.name);
      if (!topicMap.has(slug)) {
        const row = await this.prisma.reviewTopic.create({
          data: { slug, name: s.name, category: s.category || 'Other', isSystem: false },
        });
        topicMap.set(slug, row);
      }
    }

    await this.prisma.reviewAnalysis.upsert({
      where: { reviewId },
      create: {
        reviewId,
        sentiment: result.sentiment,
        sentimentScore: result.sentimentScore,
        summaryEn: result.summaryEn,
        translationEn: result.translationEn,
        positives: result.positives,
        negatives: result.negatives,
        model: model ?? undefined,
      },
      update: {
        sentiment: result.sentiment,
        sentimentScore: result.sentimentScore,
        summaryEn: result.summaryEn,
        translationEn: result.translationEn,
        positives: result.positives,
        negatives: result.negatives,
        model: model ?? undefined,
        analyzedAt: new Date(),
      },
    });

    if (result.language) {
      await this.prisma.guestReview.update({
        where: { id: reviewId },
        data: { language: result.language },
      });
    }

    await this.prisma.reviewMention.deleteMany({ where: { reviewId } });

    for (const t of result.topics) {
      let topic = topicMap.get(t.slug);
      if (!topic) {
        topic = await this.prisma.reviewTopic.create({
          data: {
            slug: t.slug,
            name: t.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
            category: 'Other',
            isSystem: false,
          },
        });
        topicMap.set(topic.slug, topic);
      }
      const evidence = t.evidence ?? '';
      const pri =
        t.polarity === 'NEGATIVE'
          ? priorityFromText(`${evidence} ${t.slug}`, t.severity)
          : null;
      await this.prisma.reviewMention.create({
        data: {
          reviewId,
          topicId: topic.id,
          polarity: t.polarity as ReviewMentionPolarity,
          severity: pri ?? undefined,
          priority: pri ?? undefined,
          evidence: t.evidence ?? undefined,
        },
      });
    }

    // Cluster negative mentions by topic slug → problem cluster
    const negMentions = await this.prisma.reviewMention.findMany({
      where: { reviewId, polarity: ReviewMentionPolarity.NEGATIVE },
      include: { topic: true },
    });
    for (const m of negMentions) {
      const clusterSlug = `problem-${m.topic.slug}`;
      const cluster = await this.prisma.reviewProblemCluster.upsert({
        where: { slug: clusterSlug },
        create: {
          slug: clusterSlug,
          title: m.topic.name,
          priority: m.priority ?? ReviewPriority.MEDIUM,
        },
        update: {},
      });
      await this.prisma.reviewMention.update({
        where: { id: m.id },
        data: { clusterId: cluster.id },
      });
      await this.prisma.reviewProblemClusterTopic.upsert({
        where: { clusterId_topicId: { clusterId: cluster.id, topicId: m.topicId } },
        create: { clusterId: cluster.id, topicId: m.topicId },
        update: {},
      });
    }
  }
}
