import {
  DEFAULT_LOCALE,
  resolveLocale,
  type SupportedLocale,
} from '@housekeeping/shared';

export type NotificationMessageKey =
  | 'teamChatMention'
  | 'teamChatMentionOther'
  | 'teamChatMessage'
  | 'teamChatMentionBody'
  | 'teamChatPhoto'
  | 'serviceRequestCreated'
  | 'serviceRequestBody'
  | 'priorityUrgent'
  | 'priorityNormal'
  | 'listAnd';

const CATALOG: Record<SupportedLocale, Record<NotificationMessageKey, string>> = {
  de: {
    teamChatMention: 'Du wurdest von {authorName} erwähnt',
    teamChatMentionOther: '{authorName} hat {mentionedNames} erwähnt',
    teamChatMessage: '{authorName} hat geschrieben',
    teamChatMentionBody: 'Team-Chat öffnen, um die Nachricht zu lesen',
    teamChatPhoto: 'Foto',
    serviceRequestCreated: 'Neue Anfrage — Zimmer {roomNumber} möchte {typeLabel}',
    serviceRequestBody: '{typeLabel} ({priority})',
    priorityUrgent: 'Dringend',
    priorityNormal: 'Normal',
    listAnd: 'und',
  },
  en: {
    teamChatMention: 'You were mentioned by {authorName}',
    teamChatMentionOther: '{authorName} mentioned {mentionedNames}',
    teamChatMessage: '{authorName} wrote',
    teamChatMentionBody: 'Open team chat to read the message',
    teamChatPhoto: 'Photo',
    serviceRequestCreated: 'New request — Room {roomNumber} wants {typeLabel}',
    serviceRequestBody: '{typeLabel} ({priority})',
    priorityUrgent: 'Urgent',
    priorityNormal: 'Normal',
    listAnd: 'and',
  },
  es: {
    teamChatMention: 'Fuiste mencionado/a por {authorName}',
    teamChatMentionOther: '{authorName} mencionó a {mentionedNames}',
    teamChatMessage: '{authorName} escribió',
    teamChatMentionBody: 'Abre el chat del equipo para leer el mensaje',
    teamChatPhoto: 'Foto',
    serviceRequestCreated: 'Nueva solicitud — Habitación {roomNumber} quiere {typeLabel}',
    serviceRequestBody: '{typeLabel} ({priority})',
    priorityUrgent: 'Urgente',
    priorityNormal: 'Normal',
    listAnd: 'y',
  },
  pt: {
    teamChatMention: 'Foste mencionado/a por {authorName}',
    teamChatMentionOther: '{authorName} mencionou {mentionedNames}',
    teamChatMessage: '{authorName} escreveu',
    teamChatMentionBody: 'Abrir o chat da equipa para ler a mensagem',
    teamChatPhoto: 'Foto',
    serviceRequestCreated: 'Novo pedido — Quarto {roomNumber} quer {typeLabel}',
    serviceRequestBody: '{typeLabel} ({priority})',
    priorityUrgent: 'Urgente',
    priorityNormal: 'Normal',
    listAnd: 'e',
  },
  tr: {
    teamChatMention: '{authorName} sizi etiketledi',
    teamChatMentionOther: '{authorName}, {mentionedNames} kişisini etiketledi',
    teamChatMessage: '{authorName} yazdı',
    teamChatMentionBody: 'Mesajı okumak için ekip sohbetini açın',
    teamChatPhoto: 'Fotoğraf',
    serviceRequestCreated: 'Yeni talep — Oda {roomNumber} {typeLabel} istiyor',
    serviceRequestBody: '{typeLabel} ({priority})',
    priorityUrgent: 'Acil',
    priorityNormal: 'Normal',
    listAnd: 've',
  },
  uk: {
    teamChatMention: 'Вас згадав(ла) {authorName}',
    teamChatMentionOther: '{authorName} згадав(ла) {mentionedNames}',
    teamChatMessage: '{authorName} написав(ла)',
    teamChatMentionBody: 'Відкрийте командний чат, щоб прочитати повідомлення',
    teamChatPhoto: 'Фото',
    serviceRequestCreated: 'Новий запит — Номер {roomNumber} хоче {typeLabel}',
    serviceRequestBody: '{typeLabel} ({priority})',
    priorityUrgent: 'Терміново',
    priorityNormal: 'Звичайний',
    listAnd: 'і',
  },
};

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => params[key] ?? `{${key}}`);
}

export function notificationLocale(preferred?: string | null): SupportedLocale {
  return resolveLocale(preferred, DEFAULT_LOCALE);
}

export function t(
  locale: string | null | undefined,
  key: NotificationMessageKey,
  params: Record<string, string> = {},
): string {
  const loc = notificationLocale(locale);
  const template = CATALOG[loc][key] ?? CATALOG[DEFAULT_LOCALE][key];
  return interpolate(template, params);
}

/** Join names: "A", "A und B", "A, B und C" (locale-aware conjunction). */
export function formatNameList(locale: string | null | undefined, names: string[]): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0]!;
  const and = t(locale, 'listAnd');
  if (cleaned.length === 2) return `${cleaned[0]} ${and} ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(', ')} ${and} ${cleaned[cleaned.length - 1]}`;
}
