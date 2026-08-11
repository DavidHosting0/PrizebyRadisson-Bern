import { resolveLocale, type SupportedLocale } from '@housekeeping/shared';

export type ChatUiStrings = {
  title: string;
  subtitle: string;
  loading: string;
  empty: string;
  today: string;
  yesterday: string;
  showOriginal: string;
  showTranslation: string;
  more: string;
  moreEmojis: string;
  emojis: string;
  back: string;
  reply: string;
  delete: string;
  deletedMessage: string;
  replyingTo: (name: string) => string;
  placeholder: string;
  noPostPermission: string;
};

const STRINGS: Record<SupportedLocale, Omit<ChatUiStrings, 'replyingTo'> & { replyingTo: string }> = {
  de: {
    title: 'Chat',
    subtitle: 'Team-Kanal · PrizeBern',
    loading: 'Laden…',
    empty: 'Noch keine Nachrichten. Schreib die erste.',
    today: 'Heute',
    yesterday: 'Gestern',
    showOriginal: 'Original anzeigen',
    showTranslation: 'Übersetzung anzeigen',
    more: 'Mehr',
    moreEmojis: 'Mehr Emojis',
    emojis: 'Emojis',
    back: 'Zurück',
    reply: 'Antworten',
    delete: 'Löschen',
    deletedMessage: 'Gelöschte Nachricht',
    replyingTo: 'Antwort an {name}',
    placeholder: 'Nachricht… @ für Erwähnung',
    noPostPermission: 'Keine Berechtigung zum Schreiben.',
  },
  en: {
    title: 'Chat',
    subtitle: 'Team channel · PrizeBern',
    loading: 'Loading…',
    empty: 'No messages yet. Write the first one.',
    today: 'Today',
    yesterday: 'Yesterday',
    showOriginal: 'Show original',
    showTranslation: 'Show translation',
    more: 'More',
    moreEmojis: 'More emojis',
    emojis: 'Emojis',
    back: 'Back',
    reply: 'Reply',
    delete: 'Delete',
    deletedMessage: 'Deleted message',
    replyingTo: 'Replying to {name}',
    placeholder: 'Message… @ to mention',
    noPostPermission: 'No permission to post.',
  },
  pt: {
    title: 'Chat',
    subtitle: 'Canal da equipa · PrizeBern',
    loading: 'A carregar…',
    empty: 'Ainda sem mensagens. Escreva a primeira.',
    today: 'Hoje',
    yesterday: 'Ontem',
    showOriginal: 'Mostrar original',
    showTranslation: 'Mostrar tradução',
    more: 'Mais',
    moreEmojis: 'Mais emojis',
    emojis: 'Emojis',
    back: 'Voltar',
    reply: 'Responder',
    delete: 'Eliminar',
    deletedMessage: 'Mensagem eliminada',
    replyingTo: 'A responder a {name}',
    placeholder: 'Mensagem… @ para mencionar',
    noPostPermission: 'Sem permissão para publicar.',
  },
  es: {
    title: 'Chat',
    subtitle: 'Canal del equipo · PrizeBern',
    loading: 'Cargando…',
    empty: 'Aún no hay mensajes. Escribe el primero.',
    today: 'Hoy',
    yesterday: 'Ayer',
    showOriginal: 'Mostrar original',
    showTranslation: 'Mostrar traducción',
    more: 'Más',
    moreEmojis: 'Más emojis',
    emojis: 'Emojis',
    back: 'Atrás',
    reply: 'Responder',
    delete: 'Eliminar',
    deletedMessage: 'Mensaje eliminado',
    replyingTo: 'Respondiendo a {name}',
    placeholder: 'Mensaje… @ para mencionar',
    noPostPermission: 'Sin permiso para publicar.',
  },
  tr: {
    title: 'Sohbet',
    subtitle: 'Ekip kanalı · PrizeBern',
    loading: 'Yükleniyor…',
    empty: 'Henüz mesaj yok. İlkini yazın.',
    today: 'Bugün',
    yesterday: 'Dün',
    showOriginal: 'Orijinali göster',
    showTranslation: 'Çeviriyi göster',
    more: 'Daha fazla',
    moreEmojis: 'Daha fazla emoji',
    emojis: 'Emojiler',
    back: 'Geri',
    reply: 'Yanıtla',
    delete: 'Sil',
    deletedMessage: 'Silinen mesaj',
    replyingTo: '{name} yanıtlanıyor',
    placeholder: 'Mesaj… @ ile bahset',
    noPostPermission: 'Yazma izniniz yok.',
  },
  uk: {
    title: 'Чат',
    subtitle: 'Командний канал · PrizeBern',
    loading: 'Завантаження…',
    empty: 'Ще немає повідомлень. Напишіть перше.',
    today: 'Сьогодні',
    yesterday: 'Вчора',
    showOriginal: 'Показати оригінал',
    showTranslation: 'Показати переклад',
    more: 'Більше',
    moreEmojis: 'Більше емодзі',
    emojis: 'Емодзі',
    back: 'Назад',
    reply: 'Відповісти',
    delete: 'Видалити',
    deletedMessage: 'Видалене повідомлення',
    replyingTo: 'Відповідь {name}',
    placeholder: 'Повідомлення… @ щоб згадати',
    noPostPermission: 'Немає дозволу на публікацію.',
  },
};

export function chatUi(preferredLocale?: string | null): ChatUiStrings {
  const locale = resolveLocale(preferredLocale);
  const s = STRINGS[locale];
  return {
    ...s,
    replyingTo: (name: string) => s.replyingTo.replace('{name}', name),
  };
}

export function dayLabel(iso: string, preferredLocale?: string | null): string {
  const locale = resolveLocale(preferredLocale);
  const s = STRINGS[locale];
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const same =
    (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return s.today;
  if (same(d, yesterday)) return s.yesterday;
  const tag =
    locale === 'en'
      ? 'en-CH'
      : locale === 'pt'
        ? 'pt-PT'
        : locale === 'es'
          ? 'es-ES'
          : locale === 'tr'
            ? 'tr-TR'
            : locale === 'uk'
              ? 'uk-UA'
              : 'de-CH';
  return d.toLocaleDateString(tag, { weekday: 'short', day: 'numeric', month: 'short' });
}
