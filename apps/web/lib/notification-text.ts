import type { NotificationDto } from '@housekeeping/shared';

type NotifyT = (
  key: string,
  params?: Record<string, string>,
) => string;

type NotificationMeta = {
  messageKey?: string;
  messageParams?: Record<string, string>;
  bodyKey?: string;
  bodyParams?: Record<string, string>;
  mentionedNameList?: string[];
};

function formatNameList(t: NotifyT, names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0]!;
  const and = t('listAnd');
  if (cleaned.length === 2) return `${cleaned[0]} ${and} ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')} ${and} ${cleaned[cleaned.length - 1]}`;
}

function resolveBodyParams(
  t: NotifyT,
  params?: Record<string, string>,
): Record<string, string> {
  if (!params) return {};
  const out = { ...params };
  const pk = out.priorityKey;
  if (pk === 'priorityUrgent' || pk === 'priorityNormal') {
    out.priority = t(pk);
    delete out.priorityKey;
  }
  return out;
}

/** Resolve localized title/body from notification metadata (or fall back to stored text). */
export function resolveNotificationText(n: NotificationDto, t: NotifyT): {
  title: string;
  body: string;
} {
  const meta = (n.metadata as NotificationMeta | null) ?? null;
  if (!meta?.messageKey) {
    return { title: n.title, body: n.body };
  }

  const messageParams = { ...(meta.messageParams ?? {}) };
  if (meta.messageKey === 'teamChatMentionOther' && Array.isArray(meta.mentionedNameList)) {
    messageParams.mentionedNames = formatNameList(t, meta.mentionedNameList);
  }

  const title = t(meta.messageKey, messageParams);
  const body = meta.bodyKey
    ? t(meta.bodyKey, resolveBodyParams(t, meta.bodyParams ?? meta.messageParams))
    : n.body;
  return { title, body };
}
