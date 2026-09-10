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
  attachPhoto: string;
  removePhoto: string;
  photoMessage: string;
  photoAlt: string;
  photoReady: string;
  photoUploadFailed: string;
  noPostPermission: string;
  serviceRequest: string;
  damageReport: string;
  room: (roomNumber: string) => string;
  claim: string;
  markDone: string;
  requestOpen: string;
  requestClaimed: string;
  requestClaimedBy: (who: string) => string;
  requestInProgress: string;
  requestInProgressBy: (who: string) => string;
  requestDone: string;
  requestCancelled: string;
  damageReported: string;
  damageAcknowledged: string;
  damageResolved: string;
  damageReportedOption: string;
  damageAcknowledgedOption: string;
  damageResolvedOption: string;
  damageType: (code: string) => string;
};

const DAMAGE_TYPES: Record<SupportedLocale, Record<string, string>> = {
  de: {
    FURNITURE: 'Möbel',
    CURTAINS: 'Vorhänge',
    FIXTURES: 'Einrichtung & Zubehör',
    WALL_OR_CEILING: 'Wand / Decke',
    FLOOR: 'Boden',
    WINDOW_OR_DOOR: 'Fenster / Tür',
    BATHROOM: 'Bad',
    ELECTRICAL_OR_APPLIANCE: 'Elektrik / Gerät',
    OTHER: 'Sonstiges',
  },
  en: {
    FURNITURE: 'Furniture',
    CURTAINS: 'Curtains',
    FIXTURES: 'Fixtures & fittings',
    WALL_OR_CEILING: 'Wall / ceiling',
    FLOOR: 'Floor',
    WINDOW_OR_DOOR: 'Window / door',
    BATHROOM: 'Bathroom',
    ELECTRICAL_OR_APPLIANCE: 'Electrical / appliance',
    OTHER: 'Other',
  },
  pt: {
    FURNITURE: 'Mobília',
    CURTAINS: 'Cortinas',
    FIXTURES: 'Instalações',
    WALL_OR_CEILING: 'Parede / teto',
    FLOOR: 'Chão',
    WINDOW_OR_DOOR: 'Janela / porta',
    BATHROOM: 'Casa de banho',
    ELECTRICAL_OR_APPLIANCE: 'Elétrico / aparelho',
    OTHER: 'Outro',
  },
  es: {
    FURNITURE: 'Mobiliario',
    CURTAINS: 'Cortinas',
    FIXTURES: 'Instalaciones',
    WALL_OR_CEILING: 'Pared / techo',
    FLOOR: 'Suelo',
    WINDOW_OR_DOOR: 'Ventana / puerta',
    BATHROOM: 'Baño',
    ELECTRICAL_OR_APPLIANCE: 'Eléctrico / aparato',
    OTHER: 'Otro',
  },
  tr: {
    FURNITURE: 'Mobilya',
    CURTAINS: 'Perdeler',
    FIXTURES: 'Demirbaş',
    WALL_OR_CEILING: 'Duvar / tavan',
    FLOOR: 'Zemin',
    WINDOW_OR_DOOR: 'Pencere / kapı',
    BATHROOM: 'Banyo',
    ELECTRICAL_OR_APPLIANCE: 'Elektrik / cihaz',
    OTHER: 'Diğer',
  },
  uk: {
    FURNITURE: 'Меблі',
    CURTAINS: 'Штори',
    FIXTURES: 'Оснащення',
    WALL_OR_CEILING: 'Стіна / стеля',
    FLOOR: 'Підлога',
    WINDOW_OR_DOOR: 'Вікно / двері',
    BATHROOM: 'Ванна',
    ELECTRICAL_OR_APPLIANCE: 'Електрика / прилад',
    OTHER: 'Інше',
  },
};

type RawStrings = Omit<
  ChatUiStrings,
  'replyingTo' | 'room' | 'requestClaimedBy' | 'requestInProgressBy' | 'damageType'
> & {
  replyingTo: string;
  room: string;
  requestClaimedBy: string;
  requestInProgressBy: string;
};

const STRINGS: Record<SupportedLocale, RawStrings> = {
  de: {
    title: 'Chat',
    subtitle: 'Team-Kanal · PrizeBern',
    loading: 'Laden…',
    empty: 'Noch keine Nachrichten oder Meldungen.',
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
    attachPhoto: 'Foto anhängen',
    removePhoto: 'Foto entfernen',
    photoMessage: 'Foto',
    photoAlt: 'Chat-Foto',
    photoReady: 'Foto bereit zum Senden',
    photoUploadFailed: 'Foto konnte nicht hochgeladen werden',
    noPostPermission: 'Keine Berechtigung zum Schreiben.',
    serviceRequest: 'Serviceanfrage',
    damageReport: 'Schadensmeldung',
    room: 'Zimmer {roomNumber}',
    claim: 'Übernehmen',
    markDone: 'Erledigt',
    requestOpen: 'Offen — noch nicht übernommen',
    requestClaimed: 'Übernommen',
    requestClaimedBy: 'Übernommen von {who}',
    requestInProgress: 'In Bearbeitung',
    requestInProgressBy: 'In Bearbeitung · {who}',
    requestDone: 'Erledigt',
    requestCancelled: 'Abgebrochen',
    damageReported: 'Gemeldet — wartet auf Prüfung',
    damageAcknowledged: 'Bestätigt',
    damageResolved: 'Erledigt',
    damageReportedOption: 'Gemeldet',
    damageAcknowledgedOption: 'Bestätigt',
    damageResolvedOption: 'Erledigt',
  },
  en: {
    title: 'Chat',
    subtitle: 'Team channel · PrizeBern',
    loading: 'Loading…',
    empty: 'No messages or reports yet.',
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
    attachPhoto: 'Attach photo',
    removePhoto: 'Remove photo',
    photoMessage: 'Photo',
    photoAlt: 'Chat photo',
    photoReady: 'Photo ready to send',
    photoUploadFailed: 'Could not upload photo',
    noPostPermission: 'No permission to post.',
    serviceRequest: 'Service request',
    damageReport: 'Damage report',
    room: 'Room {roomNumber}',
    claim: 'Claim',
    markDone: 'Done',
    requestOpen: 'Open — not claimed yet',
    requestClaimed: 'Claimed',
    requestClaimedBy: 'Claimed by {who}',
    requestInProgress: 'In progress',
    requestInProgressBy: 'In progress · {who}',
    requestDone: 'Done',
    requestCancelled: 'Cancelled',
    damageReported: 'Reported — awaiting review',
    damageAcknowledged: 'Acknowledged',
    damageResolved: 'Resolved',
    damageReportedOption: 'Reported',
    damageAcknowledgedOption: 'Acknowledged',
    damageResolvedOption: 'Resolved',
  },
  pt: {
    title: 'Chat',
    subtitle: 'Canal da equipa · PrizeBern',
    loading: 'A carregar…',
    empty: 'Ainda sem mensagens ou relatórios.',
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
    attachPhoto: 'Anexar foto',
    removePhoto: 'Remover foto',
    photoMessage: 'Foto',
    photoAlt: 'Foto do chat',
    photoReady: 'Foto pronta para enviar',
    photoUploadFailed: 'Não foi possível carregar a foto',
    noPostPermission: 'Sem permissão para publicar.',
    serviceRequest: 'Pedido de serviço',
    damageReport: 'Relatório de dano',
    room: 'Quarto {roomNumber}',
    claim: 'Assumir',
    markDone: 'Concluído',
    requestOpen: 'Aberto — ainda não assumido',
    requestClaimed: 'Assumido',
    requestClaimedBy: 'Assumido por {who}',
    requestInProgress: 'Em progresso',
    requestInProgressBy: 'Em progresso · {who}',
    requestDone: 'Concluído',
    requestCancelled: 'Cancelado',
    damageReported: 'Reportado — aguarda revisão',
    damageAcknowledged: 'Confirmado',
    damageResolved: 'Resolvido',
    damageReportedOption: 'Reportado',
    damageAcknowledgedOption: 'Confirmado',
    damageResolvedOption: 'Resolvido',
  },
  es: {
    title: 'Chat',
    subtitle: 'Canal del equipo · PrizeBern',
    loading: 'Cargando…',
    empty: 'Aún no hay mensajes o reportes.',
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
    attachPhoto: 'Adjuntar foto',
    removePhoto: 'Quitar foto',
    photoMessage: 'Foto',
    photoAlt: 'Foto del chat',
    photoReady: 'Foto lista para enviar',
    photoUploadFailed: 'No se pudo subir la foto',
    noPostPermission: 'Sin permiso para publicar.',
    serviceRequest: 'Solicitud de servicio',
    damageReport: 'Parte de daño',
    room: 'Habitación {roomNumber}',
    claim: 'Tomar',
    markDone: 'Hecho',
    requestOpen: 'Abierta — aún sin asignar',
    requestClaimed: 'Asignada',
    requestClaimedBy: 'Asignada a {who}',
    requestInProgress: 'En curso',
    requestInProgressBy: 'En curso · {who}',
    requestDone: 'Hecha',
    requestCancelled: 'Cancelada',
    damageReported: 'Reportado — pendiente',
    damageAcknowledged: 'Confirmado',
    damageResolved: 'Resuelto',
    damageReportedOption: 'Reportado',
    damageAcknowledgedOption: 'Confirmado',
    damageResolvedOption: 'Resuelto',
  },
  tr: {
    title: 'Sohbet',
    subtitle: 'Ekip kanalı · PrizeBern',
    loading: 'Yükleniyor…',
    empty: 'Henüz mesaj veya bildirim yok.',
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
    attachPhoto: 'Fotoğraf ekle',
    removePhoto: 'Fotoğrafı kaldır',
    photoMessage: 'Fotoğraf',
    photoAlt: 'Sohbet fotoğrafı',
    photoReady: 'Fotoğraf gönderilmeye hazır',
    photoUploadFailed: 'Fotoğraf yüklenemedi',
    noPostPermission: 'Yazma izniniz yok.',
    serviceRequest: 'Servis talebi',
    damageReport: 'Hasar bildirimi',
    room: 'Oda {roomNumber}',
    claim: 'Üstlen',
    markDone: 'Bitti',
    requestOpen: 'Açık — henüz alınmadı',
    requestClaimed: 'Alındı',
    requestClaimedBy: '{who} aldı',
    requestInProgress: 'Devam ediyor',
    requestInProgressBy: 'Devam ediyor · {who}',
    requestDone: 'Tamamlandı',
    requestCancelled: 'İptal',
    damageReported: 'Bildirildi — inceleme bekliyor',
    damageAcknowledged: 'Onaylandı',
    damageResolved: 'Çözüldü',
    damageReportedOption: 'Bildirildi',
    damageAcknowledgedOption: 'Onaylandı',
    damageResolvedOption: 'Çözüldü',
  },
  uk: {
    title: 'Чат',
    subtitle: 'Командний канал · PrizeBern',
    loading: 'Завантаження…',
    empty: 'Ще немає повідомлень або звітів.',
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
    attachPhoto: 'Додати фото',
    removePhoto: 'Прибрати фото',
    photoMessage: 'Фото',
    photoAlt: 'Фото в чаті',
    photoReady: 'Фото готове до надсилання',
    photoUploadFailed: 'Не вдалося завантажити фото',
    noPostPermission: 'Немає дозволу на публікацію.',
    serviceRequest: 'Сервісний запит',
    damageReport: 'Повідомлення про пошкодження',
    room: 'Кімната {roomNumber}',
    claim: 'Взяти',
    markDone: 'Готово',
    requestOpen: 'Відкрито — ще не взято',
    requestClaimed: 'Взято',
    requestClaimedBy: 'Взято {who}',
    requestInProgress: 'В роботі',
    requestInProgressBy: 'В роботі · {who}',
    requestDone: 'Виконано',
    requestCancelled: 'Скасовано',
    damageReported: 'Повідомлено — очікує перевірки',
    damageAcknowledged: 'Підтверджено',
    damageResolved: 'Вирішено',
    damageReportedOption: 'Повідомлено',
    damageAcknowledgedOption: 'Підтверджено',
    damageResolvedOption: 'Вирішено',
  },
};

export function chatUi(preferredLocale?: string | null): ChatUiStrings {
  const locale = resolveLocale(preferredLocale);
  const s = STRINGS[locale];
  const types = DAMAGE_TYPES[locale];
  return {
    ...s,
    replyingTo: (name: string) => s.replyingTo.replace('{name}', name),
    room: (roomNumber: string) => s.room.replace('{roomNumber}', roomNumber),
    requestClaimedBy: (who: string) => s.requestClaimedBy.replace('{who}', who),
    requestInProgressBy: (who: string) => s.requestInProgressBy.replace('{who}', who),
    damageType: (code: string) => types[code] ?? code.replace(/_/g, ' '),
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
