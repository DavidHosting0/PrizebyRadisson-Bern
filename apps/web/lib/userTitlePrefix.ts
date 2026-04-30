/** Matches API `UserTitlePrefix` enum — display labels for UI. */
export const USER_TITLE_PREFIX_OPTIONS = [
  { value: 'CLEANER', label: 'Cleaner' },
  { value: 'HOUSEKEEPING_SUPERVISOR', label: 'Housekeeping Supervisor' },
  { value: 'RECEPTION', label: 'Reception' },
  { value: 'HTC_IN_TRAINING', label: 'HTC in Training' },
  { value: 'HTC', label: 'HTC' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'TECHNICIAN', label: 'Technician' },
] as const;

export type UserTitlePrefixValue = (typeof USER_TITLE_PREFIX_OPTIONS)[number]['value'];

export function userTitlePrefixLabel(prefix: string | null | undefined): string {
  if (!prefix) return '';
  const row = USER_TITLE_PREFIX_OPTIONS.find((o) => o.value === prefix);
  return row?.label ?? prefix.replace(/_/g, ' ');
}

/** Shown in headers, chat badges, assignments: "Prefix · Name" */
export function formatUserWithTitlePrefix(name: string, titlePrefix?: string | null): string {
  const p = userTitlePrefixLabel(titlePrefix);
  if (!p) return name;
  return `${p} · ${name}`;
}

type UserLike = { id: string; name: string; titlePrefix?: string | null };

export function formatUserRef(u: UserLike | null | undefined): string {
  if (!u) return '';
  return formatUserWithTitlePrefix(u.name, u.titlePrefix);
}

/**
 * Derive the API `UserRole` (account type — drives which app shell the user
 * lands in after login) from the chosen title prefix. The two are tightly
 * coupled in this app: e.g. "Cleaner" always lives in the housekeeper app.
 *
 * Permissions on top of that are now handled by the custom Roles system,
 * so admins shouldn't have to pick the account type separately.
 */
export function accountTypeForTitlePrefix(prefix: string): string {
  switch (prefix) {
    case 'RECEPTION':
      return 'RECEPTION';
    case 'ADMIN':
      return 'ADMIN';
    case 'TECHNICIAN':
      return 'TECHNICIAN';
    case 'HOUSEKEEPING_SUPERVISOR':
      return 'SUPERVISOR';
    case 'CLEANER':
    case 'HTC_IN_TRAINING':
    case 'HTC':
    default:
      return 'HOUSEKEEPER';
  }
}
