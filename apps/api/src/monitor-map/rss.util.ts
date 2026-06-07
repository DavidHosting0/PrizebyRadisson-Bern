import { createHash } from 'node:crypto';

export type RssItem = {
  externalId: string;
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
};

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function stripTags(html: string): string {
  return decodeXmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function pickTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : null;
}

function parseDate(raw: string | null): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function hashExternalId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export async function fetchRssItems(feedUrl: string, limit = 30): Promise<RssItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': 'HousekeepingMonitorMap/1.0 (+https://prizebyradisson.ch)',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`RSS fetch failed (${res.status}): ${feedUrl}`);
  }
  const xml = await res.text();
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks.slice(0, limit)) {
    const title = pickTag(block, 'title');
    const link = pickTag(block, 'link') ?? pickTag(block, 'guid');
    if (!title || !link) continue;
    const guid = pickTag(block, 'guid');
    const description =
      pickTag(block, 'description') ?? pickTag(block, 'content:encoded') ?? pickTag(block, 'summary');
    const pubDate = pickTag(block, 'pubDate') ?? pickTag(block, 'published') ?? pickTag(block, 'updated');
    const externalId = hashExternalId(guid ?? link);
    items.push({
      externalId,
      title: stripTags(title),
      summary: description ? stripTags(description).slice(0, 500) : null,
      url: link.trim(),
      publishedAt: parseDate(pubDate),
    });
  }
  return items;
}

export function extractLocationFromText(title: string, summary: string | null): string | null {
  const text = `${title} ${summary ?? ''}`;
  const patterns = [
    /(?:in|bei|à|a)\s+([A-ZÄÖÜ][a-zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+){0,3})/,
    /(?:Bern|Biel|Thun|Burgdorf|Köniz|Muri|Münsingen|Ostermundigen|Ittigen|Zollikofen)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1] ?? m[0];
  }
  return null;
}
