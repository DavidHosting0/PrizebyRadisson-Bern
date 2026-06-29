export type MentionForPlaceholder = {
  userId: string;
  name: string;
};

const PLACEHOLDER_RE = /\{\{MENTION:([^}]+)\}\}/g;

/** Replace @Name tokens with stable placeholders before machine translation. */
export function shieldMentions(body: string, mentions: MentionForPlaceholder[]): string {
  let out = body;
  const sorted = [...mentions].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const escaped = m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${escaped}`, 'g');
    out = out.replace(re, `{{MENTION:${m.userId}}}`);
  }
  return out;
}

/** Restore @Name tokens after translation. */
export function unshieldMentions(
  body: string,
  mentions: MentionForPlaceholder[],
): string {
  const byId = new Map(mentions.map((m) => [m.userId, m.name]));
  return body.replace(PLACEHOLDER_RE, (_match, userId: string) => {
    const name = byId.get(userId);
    return name ? `@${name}` : _match;
  });
}
