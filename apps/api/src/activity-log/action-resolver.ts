import { ActivityLogCategory } from '@prisma/client';

export type ResolvedActivity = {
  action: string;
  label: string;
  category: ActivityLogCategory;
  resourceType?: string;
  resourceId?: string;
};

type RouteRule = {
  method: string;
  pattern: RegExp;
  action: string;
  label: string;
  category: ActivityLogCategory;
  resourceType?: string;
  resourceIndex?: number;
};

const RULES: RouteRule[] = [
  // Auth
  { method: 'POST', pattern: /^\/auth\/login$/, action: 'auth.login', label: 'Anmeldung', category: ActivityLogCategory.AUTH },
  { method: 'POST', pattern: /^\/auth\/logout$/, action: 'auth.logout', label: 'Abmeldung', category: ActivityLogCategory.AUTH },
  { method: 'POST', pattern: /^\/auth\/refresh$/, action: 'auth.refresh', label: 'Token erneuert', category: ActivityLogCategory.AUTH },

  // Users
  { method: 'POST', pattern: /^\/users$/, action: 'users.create', label: 'Benutzer erstellt', category: ActivityLogCategory.USER },
  { method: 'PATCH', pattern: /^\/users\/([^/]+)$/, action: 'users.update', label: 'Benutzer bearbeitet', category: ActivityLogCategory.USER, resourceType: 'user', resourceIndex: 1 },
  { method: 'DELETE', pattern: /^\/users\/([^/]+)$/, action: 'users.delete', label: 'Benutzer gelöscht', category: ActivityLogCategory.USER, resourceType: 'user', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/users\/me\/avatar\/presign$/, action: 'users.avatar.presign', label: 'Avatar-Upload vorbereitet', category: ActivityLogCategory.USER },
  { method: 'PATCH', pattern: /^\/users\/me\/avatar$/, action: 'users.avatar.update', label: 'Avatar geändert', category: ActivityLogCategory.USER },
  { method: 'DELETE', pattern: /^\/users\/me\/avatar$/, action: 'users.avatar.delete', label: 'Avatar entfernt', category: ActivityLogCategory.USER },
  { method: 'PATCH', pattern: /^\/users\/me\/locale$/, action: 'users.locale.update', label: 'Sprache geändert', category: ActivityLogCategory.USER },

  // Roles
  { method: 'POST', pattern: /^\/roles$/, action: 'roles.create', label: 'Rolle erstellt', category: ActivityLogCategory.ROLE },
  { method: 'PATCH', pattern: /^\/roles\/([^/]+)$/, action: 'roles.update', label: 'Rolle bearbeitet', category: ActivityLogCategory.ROLE, resourceType: 'role', resourceIndex: 1 },
  { method: 'DELETE', pattern: /^\/roles\/([^/]+)$/, action: 'roles.delete', label: 'Rolle gelöscht', category: ActivityLogCategory.ROLE, resourceType: 'role', resourceIndex: 1 },
  { method: 'PATCH', pattern: /^\/roles\/([^/]+)\/position$/, action: 'roles.position', label: 'Rollen-Reihenfolge geändert', category: ActivityLogCategory.ROLE, resourceType: 'role', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/roles\/reorder$/, action: 'roles.reorder', label: 'Rollen sortiert', category: ActivityLogCategory.ROLE },
  { method: 'PUT', pattern: /^\/roles\/([^/]+)\/members$/, action: 'roles.members.set', label: 'Rollen-Mitglieder gesetzt', category: ActivityLogCategory.ROLE, resourceType: 'role', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/roles\/([^/]+)\/members\/([^/]+)$/, action: 'roles.members.add', label: 'Mitglied zu Rolle hinzugefügt', category: ActivityLogCategory.ROLE, resourceType: 'role', resourceIndex: 1 },
  { method: 'DELETE', pattern: /^\/roles\/([^/]+)\/members\/([^/]+)$/, action: 'roles.members.remove', label: 'Mitglied aus Rolle entfernt', category: ActivityLogCategory.ROLE, resourceType: 'role', resourceIndex: 1 },

  // Rooms
  { method: 'PATCH', pattern: /^\/rooms\/([^/]+)$/, action: 'rooms.update', label: 'Zimmer bearbeitet', category: ActivityLogCategory.ROOM, resourceType: 'room', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/rooms\/([^/]+)\/mark-clean$/, action: 'rooms.mark_clean', label: 'Zimmer als sauber gemeldet', category: ActivityLogCategory.ROOM, resourceType: 'room', resourceIndex: 1 },

  // Checklists
  { method: 'PATCH', pattern: /^\/checklists\/tasks\/([^/]+)$/, action: 'checklists.task.update', label: 'Checklisten-Aufgabe aktualisiert', category: ActivityLogCategory.CHECKLIST, resourceType: 'checklist_task', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/checklists\/reopen$/, action: 'checklists.reopen', label: 'Checkliste wiedereröffnet', category: ActivityLogCategory.CHECKLIST },

  // Photos
  { method: 'POST', pattern: /^\/photos\/presign$/, action: 'photos.presign', label: 'Foto-Upload vorbereitet', category: ActivityLogCategory.PHOTO },
  { method: 'POST', pattern: /^\/photos\/complete$/, action: 'photos.complete', label: 'Foto hochgeladen', category: ActivityLogCategory.PHOTO },

  // Service requests
  { method: 'POST', pattern: /^\/service-requests$/, action: 'service_requests.create', label: 'Service-Request erstellt', category: ActivityLogCategory.SERVICE_REQUEST },
  { method: 'POST', pattern: /^\/service-requests\/([^/]+)\/claim$/, action: 'service_requests.claim', label: 'Service-Request übernommen', category: ActivityLogCategory.SERVICE_REQUEST, resourceType: 'service_request', resourceIndex: 1 },
  { method: 'PATCH', pattern: /^\/service-requests\/([^/]+)$/, action: 'service_requests.update', label: 'Service-Request bearbeitet', category: ActivityLogCategory.SERVICE_REQUEST, resourceType: 'service_request', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/service-requests\/([^/]+)\/cancel$/, action: 'service_requests.cancel', label: 'Service-Request storniert', category: ActivityLogCategory.SERVICE_REQUEST, resourceType: 'service_request', resourceIndex: 1 },

  // Lost & found
  { method: 'POST', pattern: /^\/lost-found$/, action: 'lost_found.create', label: 'Fundsache erfasst', category: ActivityLogCategory.LOST_FOUND },
  { method: 'POST', pattern: /^\/lost-found\/presign$/, action: 'lost_found.presign', label: 'Fundsache-Foto vorbereitet', category: ActivityLogCategory.LOST_FOUND },
  { method: 'PATCH', pattern: /^\/lost-found\/([^/]+)$/, action: 'lost_found.update', label: 'Fundsache bearbeitet', category: ActivityLogCategory.LOST_FOUND, resourceType: 'lost_found', resourceIndex: 1 },

  // Damage
  { method: 'POST', pattern: /^\/damage-reports$/, action: 'damage.create', label: 'Schaden gemeldet', category: ActivityLogCategory.DAMAGE },
  { method: 'POST', pattern: /^\/damage-reports\/presign$/, action: 'damage.presign', label: 'Schaden-Foto vorbereitet', category: ActivityLogCategory.DAMAGE },
  { method: 'PATCH', pattern: /^\/damage-reports\/([^/]+)$/, action: 'damage.update', label: 'Schaden bearbeitet', category: ActivityLogCategory.DAMAGE, resourceType: 'damage_report', resourceIndex: 1 },

  // Assignments
  { method: 'POST', pattern: /^\/assignments$/, action: 'assignments.create', label: 'Zimmer zugewiesen', category: ActivityLogCategory.ASSIGNMENT },
  { method: 'POST', pattern: /^\/assignments\/suggestions$/, action: 'assignments.suggestions', label: 'Zuweisungs-Vorschläge abgerufen', category: ActivityLogCategory.ASSIGNMENT },
  { method: 'POST', pattern: /^\/assignments\/run-auto$/, action: 'assignments.run_auto', label: 'Auto-Zuweisung gestartet', category: ActivityLogCategory.ASSIGNMENT },

  // Inspections
  { method: 'POST', pattern: /^\/inspections$/, action: 'inspections.create', label: 'Inspektion erfasst', category: ActivityLogCategory.INSPECTION },

  // Settings
  { method: 'PATCH', pattern: /^\/settings$/, action: 'settings.update', label: 'Hotel-Einstellungen geändert', category: ActivityLogCategory.SETTINGS },
  { method: 'PATCH', pattern: /^\/settings\/puzzle-login$/, action: 'settings.puzzle_login', label: 'Puzzle-Login geändert', category: ActivityLogCategory.SETTINGS },
  { method: 'PATCH', pattern: /^\/settings\/emma-login$/, action: 'settings.emma_login', label: 'EMMA-Login geändert', category: ActivityLogCategory.SETTINGS },
  { method: 'PATCH', pattern: /^\/settings\/ai-config$/, action: 'settings.ai_config', label: 'KI-Konfiguration geändert', category: ActivityLogCategory.SETTINGS },

  // Floor plans
  { method: 'PUT', pattern: /^\/floor-plans\/([^/]+)$/, action: 'floor_plans.update', label: 'Grundriss bearbeitet', category: ActivityLogCategory.FLOOR_PLAN, resourceType: 'floor_plan', resourceIndex: 1 },

  // Room types
  { method: 'PUT', pattern: /^\/room-types\/([^/]+)\/checklist-template$/, action: 'room_types.checklist.update', label: 'Checklisten-Vorlage bearbeitet', category: ActivityLogCategory.ROOM, resourceType: 'room_type', resourceIndex: 1 },

  // Team chat
  { method: 'POST', pattern: /^\/team-chat\/messages$/, action: 'team_chat.message.create', label: 'Chat-Nachricht gesendet', category: ActivityLogCategory.TEAM_CHAT },
  { method: 'POST', pattern: /^\/team-chat\/messages\/([^/]+)\/reactions$/, action: 'team_chat.reaction', label: 'Chat-Reaktion gesetzt', category: ActivityLogCategory.TEAM_CHAT, resourceType: 'team_chat_message', resourceIndex: 1 },

  // Favur / shifts
  { method: 'PUT', pattern: /^\/favur\/config$/, action: 'favur.config.update', label: 'Favur-Konfiguration geändert', category: ActivityLogCategory.SHIFT },
  { method: 'POST', pattern: /^\/favur\/api-key$/, action: 'favur.api_key.rotate', label: 'Favur API-Key erneuert', category: ActivityLogCategory.SHIFT },
  { method: 'POST', pattern: /^\/favur\/captures\/([^/]+)\/activate$/, action: 'favur.capture.activate', label: 'Favur-Capture aktiviert', category: ActivityLogCategory.SHIFT, resourceType: 'favur_capture', resourceIndex: 1 },
  { method: 'DELETE', pattern: /^\/favur\/captures\/([^/]+)$/, action: 'favur.capture.delete', label: 'Favur-Capture gelöscht', category: ActivityLogCategory.SHIFT, resourceType: 'favur_capture', resourceIndex: 1 },
  { method: 'PUT', pattern: /^\/favur\/users\/([^/]+)$/, action: 'favur.user_map', label: 'Favur-Benutzer-Zuordnung geändert', category: ActivityLogCategory.SHIFT, resourceType: 'favur_user', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/favur\/sync$/, action: 'favur.sync', label: 'Favur-Sync gestartet', category: ActivityLogCategory.SHIFT },
  { method: 'POST', pattern: /^\/favur\/import$/, action: 'favur.import', label: 'Schichtplan importiert (Extension)', category: ActivityLogCategory.SHIFT },
  { method: 'POST', pattern: /^\/favur\/import-dom$/, action: 'favur.import_dom', label: 'Schichtplan importiert (DOM)', category: ActivityLogCategory.SHIFT },

  // Reservations / EMMA
  { method: 'POST', pattern: /^\/reservations\/sync$/, action: 'reservations.sync', label: 'Reservierungs-Sync gestartet', category: ActivityLogCategory.RESERVATION },
  { method: 'POST', pattern: /^\/reservations\/([^/]+)\/fetch-detail$/, action: 'reservations.fetch_detail', label: 'Reservierungs-Details geladen', category: ActivityLogCategory.RESERVATION, resourceType: 'reservation', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/reservations\/([^/]+)\/fetch-folio$/, action: 'reservations.fetch_folio', label: 'Folio geladen', category: ActivityLogCategory.RESERVATION, resourceType: 'reservation', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/reservations\/([^/]+)\/move-folio-charge$/, action: 'reservations.move_folio_charge', label: 'Folio-Buchung verschoben', category: ActivityLogCategory.RESERVATION, resourceType: 'reservation', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/emma\/session\/invalidate$/, action: 'emma.session.invalidate', label: 'EMMA-Session invalidiert', category: ActivityLogCategory.EMMA },
  { method: 'POST', pattern: /^\/emma\/session\/refresh-http$/, action: 'emma.session.refresh', label: 'EMMA-Session erneuert', category: ActivityLogCategory.EMMA },
  { method: 'POST', pattern: /^\/emma\/room-status\/sync$/, action: 'emma.room_status.sync', label: 'EMMA-Zimmerstatus synchronisiert', category: ActivityLogCategory.EMMA },
  { method: 'PATCH', pattern: /^\/emma\/backup-mode$/, action: 'emma.backup_mode', label: 'EMMA-Backup-Modus geändert', category: ActivityLogCategory.EMMA },

  // Arrival check
  { method: 'POST', pattern: /^\/arrival-check\/sync$/, action: 'arrival_check.sync', label: 'Arrival-Check Sync', category: ActivityLogCategory.ARRIVAL_CHECK },
  { method: 'POST', pattern: /^\/arrival-check\/runs$/, action: 'arrival_check.run.create', label: 'Arrival-Check Run gestartet', category: ActivityLogCategory.ARRIVAL_CHECK },
  { method: 'POST', pattern: /^\/arrival-check\/runs\/([^/]+)\/execute$/, action: 'arrival_check.run.execute', label: 'Arrival-Check ausgeführt', category: ActivityLogCategory.ARRIVAL_CHECK, resourceType: 'arrival_check_run', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/arrival-check\/runs\/([^/]+)\/cancel$/, action: 'arrival_check.run.cancel', label: 'Arrival-Check abgebrochen', category: ActivityLogCategory.ARRIVAL_CHECK, resourceType: 'arrival_check_run', resourceIndex: 1 },

  // Departures
  { method: 'POST', pattern: /^\/departures\/refresh$/, action: 'departures.refresh', label: 'Abreisen aktualisiert', category: ActivityLogCategory.RESERVATION },

  // Guides
  { method: 'POST', pattern: /^\/guides$/, action: 'guides.create', label: 'Guide erstellt', category: ActivityLogCategory.GUIDE },
  { method: 'PATCH', pattern: /^\/guides\/([^/]+)$/, action: 'guides.update', label: 'Guide bearbeitet', category: ActivityLogCategory.GUIDE, resourceType: 'guide', resourceIndex: 1 },
  { method: 'DELETE', pattern: /^\/guides\/([^/]+)$/, action: 'guides.delete', label: 'Guide gelöscht', category: ActivityLogCategory.GUIDE, resourceType: 'guide', resourceIndex: 1 },
  { method: 'PATCH', pattern: /^\/guides\/reorder$/, action: 'guides.reorder', label: 'Guides sortiert', category: ActivityLogCategory.GUIDE },

  // Shift handover
  { method: 'PUT', pattern: /^\/shift-handover\/templates\/([^/]+)$/, action: 'shift_handover.templates.update', label: 'Schichtübergabe-Vorlage bearbeitet', category: ActivityLogCategory.SHIFT_HANDOVER, resourceType: 'shift', resourceIndex: 1 },
  { method: 'PATCH', pattern: /^\/shift-handover\/tasks\/([^/]+)$/, action: 'shift_handover.task.toggle', label: 'Schichtübergabe-Aufgabe abgehakt', category: ActivityLogCategory.SHIFT_HANDOVER, resourceType: 'shift_handover_task', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/shift-handover\/handover$/, action: 'shift_handover.handover', label: 'Schicht übergeben', category: ActivityLogCategory.SHIFT_HANDOVER },

  // Monitor map
  { method: 'POST', pattern: /^\/monitor-map\/admin\/feeds$/, action: 'monitor_map.feed.create', label: 'Monitor-Map Feed erstellt', category: ActivityLogCategory.MONITOR_MAP },
  { method: 'PATCH', pattern: /^\/monitor-map\/admin\/feeds\/([^/]+)$/, action: 'monitor_map.feed.update', label: 'Monitor-Map Feed bearbeitet', category: ActivityLogCategory.MONITOR_MAP, resourceType: 'monitor_map_feed', resourceIndex: 1 },
  { method: 'DELETE', pattern: /^\/monitor-map\/admin\/feeds\/([^/]+)$/, action: 'monitor_map.feed.delete', label: 'Monitor-Map Feed gelöscht', category: ActivityLogCategory.MONITOR_MAP, resourceType: 'monitor_map_feed', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/monitor-map\/admin\/sync$/, action: 'monitor_map.sync', label: 'Monitor-Map Sync gestartet', category: ActivityLogCategory.MONITOR_MAP },

  // Puzzle
  { method: 'PATCH', pattern: /^\/puzzle\/filter$/, action: 'puzzle.filter.update', label: 'Puzzle-Filter geändert', category: ActivityLogCategory.INTEGRATION },
  { method: 'POST', pattern: /^\/puzzle\/tickets\/([^/]+)\/messages\/refresh$/, action: 'puzzle.ticket.messages.refresh', label: 'Puzzle-Nachrichten aktualisiert', category: ActivityLogCategory.INTEGRATION, resourceType: 'puzzle_ticket', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/puzzle\/tickets\/([^/]+)\/assign-to-me$/, action: 'puzzle.ticket.assign', label: 'Puzzle-Ticket übernommen', category: ActivityLogCategory.INTEGRATION, resourceType: 'puzzle_ticket', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/puzzle\/tickets\/([^/]+)\/reply$/, action: 'puzzle.ticket.reply', label: 'Puzzle-Ticket beantwortet', category: ActivityLogCategory.INTEGRATION, resourceType: 'puzzle_ticket', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/puzzle\/tickets\/([^/]+)\/resolve$/, action: 'puzzle.ticket.resolve', label: 'Puzzle-Ticket erledigt', category: ActivityLogCategory.INTEGRATION, resourceType: 'puzzle_ticket', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/puzzle\/sync$/, action: 'puzzle.sync', label: 'Puzzle-Sync gestartet', category: ActivityLogCategory.INTEGRATION },
  { method: 'POST', pattern: /^\/puzzle\/tickets\/([^/]+)\/analysis\/refresh$/, action: 'puzzle.ticket.analysis', label: 'Puzzle-KI-Analyse aktualisiert', category: ActivityLogCategory.INTEGRATION, resourceType: 'puzzle_ticket', resourceIndex: 1 },

  // Notifications / push
  { method: 'POST', pattern: /^\/push\/subscriptions$/, action: 'push.subscribe', label: 'Push-Benachrichtigung aktiviert', category: ActivityLogCategory.NOTIFICATION },
  { method: 'DELETE', pattern: /^\/push\/subscriptions$/, action: 'push.unsubscribe', label: 'Push-Benachrichtigung deaktiviert', category: ActivityLogCategory.NOTIFICATION },
  { method: 'PATCH', pattern: /^\/notifications\/([^/]+)\/read$/, action: 'notifications.read', label: 'Benachrichtigung gelesen', category: ActivityLogCategory.NOTIFICATION, resourceType: 'notification', resourceIndex: 1 },
  { method: 'POST', pattern: /^\/notifications\/read-all$/, action: 'notifications.read_all', label: 'Alle Benachrichtigungen gelesen', category: ActivityLogCategory.NOTIFICATION },
];

const CATEGORY_BY_PREFIX: Record<string, ActivityLogCategory> = {
  auth: ActivityLogCategory.AUTH,
  users: ActivityLogCategory.USER,
  roles: ActivityLogCategory.ROLE,
  rooms: ActivityLogCategory.ROOM,
  checklists: ActivityLogCategory.CHECKLIST,
  photos: ActivityLogCategory.PHOTO,
  'service-requests': ActivityLogCategory.SERVICE_REQUEST,
  'lost-found': ActivityLogCategory.LOST_FOUND,
  'damage-reports': ActivityLogCategory.DAMAGE,
  assignments: ActivityLogCategory.ASSIGNMENT,
  inspections: ActivityLogCategory.INSPECTION,
  settings: ActivityLogCategory.SETTINGS,
  'floor-plans': ActivityLogCategory.FLOOR_PLAN,
  'room-types': ActivityLogCategory.ROOM,
  'team-chat': ActivityLogCategory.TEAM_CHAT,
  favur: ActivityLogCategory.SHIFT,
  shifts: ActivityLogCategory.SHIFT,
  reservations: ActivityLogCategory.RESERVATION,
  emma: ActivityLogCategory.EMMA,
  'arrival-check': ActivityLogCategory.ARRIVAL_CHECK,
  departures: ActivityLogCategory.RESERVATION,
  guides: ActivityLogCategory.GUIDE,
  'shift-handover': ActivityLogCategory.SHIFT_HANDOVER,
  'monitor-map': ActivityLogCategory.MONITOR_MAP,
  'room-management': ActivityLogCategory.ROOM_MANAGEMENT,
  puzzle: ActivityLogCategory.INTEGRATION,
  push: ActivityLogCategory.NOTIFICATION,
  notifications: ActivityLogCategory.NOTIFICATION,
  'front-office': ActivityLogCategory.RESERVATION,
};

const METHOD_VERBS: Record<string, string> = {
  POST: 'erstellt/ausgeführt',
  PUT: 'aktualisiert',
  PATCH: 'bearbeitet',
  DELETE: 'gelöscht',
};

export function normalizeApiPath(rawPath: string): string {
  const withoutQuery = rawPath.split('?')[0] ?? rawPath;
  return withoutQuery.replace(/^\/api\/v1/, '') || '/';
}

export function resolveActivityAction(method: string, rawPath: string): ResolvedActivity {
  const path = normalizeApiPath(rawPath);
  const upperMethod = method.toUpperCase();

  for (const rule of RULES) {
    if (rule.method !== upperMethod) continue;
    const match = path.match(rule.pattern);
    if (!match) continue;
    const resourceId = rule.resourceIndex != null ? match[rule.resourceIndex] : undefined;
    return {
      action: rule.action,
      label: rule.label,
      category: rule.category,
      resourceType: rule.resourceType,
      resourceId,
    };
  }

  const segments = path.split('/').filter(Boolean);
  const prefix = segments[0] ?? 'unknown';
  const category = CATEGORY_BY_PREFIX[prefix] ?? ActivityLogCategory.OTHER;
  const action = `${prefix.replace(/-/g, '_')}.${upperMethod.toLowerCase()}`;
  const verb = METHOD_VERBS[upperMethod] ?? upperMethod;
  const label = `${prefix} ${verb}`;

  return {
    action,
    label,
    category,
    resourceType: segments.length > 1 ? prefix.replace(/-/g, '_') : undefined,
    resourceId: segments.length > 1 ? segments[1] : undefined,
  };
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityLogCategory, string> = {
  AUTH: 'Anmeldung',
  USER: 'Benutzer',
  ROOM: 'Zimmer',
  CHECKLIST: 'Checkliste',
  PHOTO: 'Fotos',
  SERVICE_REQUEST: 'Service-Requests',
  LOST_FOUND: 'Fundsachen',
  DAMAGE: 'Schäden',
  ASSIGNMENT: 'Zuweisungen',
  INSPECTION: 'Inspektionen',
  SETTINGS: 'Einstellungen',
  ROLE: 'Rollen',
  FLOOR_PLAN: 'Grundrisse',
  TEAM_CHAT: 'Team-Chat',
  SHIFT: 'Schichtplan',
  RESERVATION: 'Reservierungen',
  EMMA: 'EMMA',
  ARRIVAL_CHECK: 'Arrival Check',
  GUIDE: 'Guides',
  SHIFT_HANDOVER: 'Schichtübergabe',
  MONITOR_MAP: 'Monitor Map',
  ROOM_MANAGEMENT: 'Zimmerverwaltung',
  INTEGRATION: 'Integrationen',
  NOTIFICATION: 'Benachrichtigungen',
  SYSTEM: 'System',
  OTHER: 'Sonstiges',
};
