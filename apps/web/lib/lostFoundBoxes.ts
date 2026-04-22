/**
 * Canonical list of physical storage-box codes used at the reception storage
 * for Lost & Found items. Kept as a flat list so it can feed selects and
 * filters directly.
 */
export const LOST_FOUND_BOXES = [
  'A1', 'A2', 'A3', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D1', 'D2', 'D3', 'D4',
] as const;

export type LostFoundBox = (typeof LOST_FOUND_BOXES)[number];

export function isLostFoundBox(value: string): value is LostFoundBox {
  return (LOST_FOUND_BOXES as readonly string[]).includes(value);
}
