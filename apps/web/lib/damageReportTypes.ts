'use client';

import { useTranslations } from 'next-intl';

/** Matches API enum `RoomDamageType`. */
export const DAMAGE_TYPE_VALUES = [
  'FURNITURE',
  'FIXTURES',
  'WALL_OR_CEILING',
  'FLOOR',
  'WINDOW_OR_DOOR',
  'BATHROOM',
  'ELECTRICAL_OR_APPLIANCE',
  'OTHER',
] as const;

export function useDamageTypeOptions() {
  const t = useTranslations('damage');
  return DAMAGE_TYPE_VALUES.map((value) => ({
    value,
    label: t(value),
  }));
}

export function useDamageTypeLabel() {
  const t = useTranslations('damage');
  return (code: string) => {
    if ((DAMAGE_TYPE_VALUES as readonly string[]).includes(code)) {
      return t(code as (typeof DAMAGE_TYPE_VALUES)[number]);
    }
    return code;
  };
}

/** @deprecated Use useDamageTypeLabel() in client components. */
export function damageTypeLabel(code: string): string {
  return code;
}
