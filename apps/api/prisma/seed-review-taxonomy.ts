import type { PrismaClient } from '@prisma/client';
import { REVIEW_TOPIC_TAXONOMY } from '../src/review-analyzer/taxonomy';

/** Seed system topic taxonomy only — no demo reviews. */
export async function seedReviewTaxonomy(prisma: PrismaClient) {
  for (const t of REVIEW_TOPIC_TAXONOMY) {
    await prisma.reviewTopic.upsert({
      where: { slug: t.slug },
      create: { slug: t.slug, name: t.name, category: t.category, isSystem: true },
      update: { name: t.name, category: t.category, isSystem: true },
    });
  }
  console.log(`Review Analyzer taxonomy: ${REVIEW_TOPIC_TAXONOMY.length} topics`);
}
