/** Matches API `UserTitlePrefix` enum — display labels for UI. */
export const USER_TITLE_PREFIX_OPTIONS = [
  { value: 'CLEANER', label: 'Cleaner' },
  { value: 'HOUSEKEEPING_SUPERVISOR', label: 'Housekeeping Supervisor' },
  { value: 'RECEPTION', label: 'Reception' },
  { value: 'HTC_IN_TRAINING', label: 'HTC in Training' },
  { value: 'HTC', label: 'HTC' },
  { value: 'ADMIN', label: 'Admin' },
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
