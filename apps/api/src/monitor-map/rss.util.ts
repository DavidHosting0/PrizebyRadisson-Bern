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
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : null;
}

function pickAttr(block: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]).trim() : null;
}

function parseDate(raw: string | null): Date {
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export function hashExternalId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

function parseRssItemBlock(block: string): RssItem | null {
  const title = pickTag(block, 'title');
  const link =
    pickTag(block, 'link') ??
    pickTag(block, 'guid') ??
    pickAttr(block, 'rdf:about') ??
    pickAttr(block, 'about');
  if (!title || !link) return null;

  const guid = pickTag(block, 'guid');
  const description =
    pickTag(block, 'description') ??
    pickTag(block, 'content:encoded') ??
    pickTag(block, 'summary') ??
    pickTag(block, 'content');
  const pubDate =
    pickTag(block, 'pubDate') ??
    pickTag(block, 'published') ??
    pickTag(block, 'updated') ??
    pickTag(block, 'dc:date') ??
    pickTag(block, 'date');

  const externalId = hashExternalId(guid ?? link);
  return {
    externalId,
    title: stripTags(title),
    summary: description ? stripTags(description).slice(0, 500) : null,
    url: link.trim(),
    publishedAt: parseDate(pubDate),
  };
}

export function parseRssXml(xml: string, limit = 30): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks.slice(0, limit)) {
    const item = parseRssItemBlock(block);
    if (item) items.push(item);
  }
  return items;
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
  return parseRssXml(xml, limit);
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
