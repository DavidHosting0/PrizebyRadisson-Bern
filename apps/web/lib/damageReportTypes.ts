/** Matches API enum `RoomDamageType`. */
export const DAMAGE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'FIXTURES', label: 'Fixtures & fittings' },
  { value: 'WALL_OR_CEILING', label: 'Wall / ceiling' },
  { value: 'FLOOR', label: 'Floor' },
  { value: 'WINDOW_OR_DOOR', label: 'Window / door' },
  { value: 'BATHROOM', label: 'Bathroom' },
  { value: 'ELECTRICAL_OR_APPLIANCE', label: 'Electrical / appliance' },
  { value: 'OTHER', label: 'Other' },
];

export function damageTypeLabel(code: string): string {
  return DAMAGE_TYPE_OPTIONS.find((o) => o.value === code)?.label ?? code;
}
