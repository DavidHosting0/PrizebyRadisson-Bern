/** Human-readable room board status for UI and toasts. */
export const ROOM_STATUS_LABEL: Record<string, string> = {
  OUT_OF_ORDER: 'Außer Betrieb',
  DIRTY: 'Schmutzig',
  IN_PROGRESS: 'In Bearbeitung',
  CLEAN: 'Sauber',
  INSPECTED: 'Inspeziert',
};

export function formatRoomStatusLabel(status: string): string {
  return ROOM_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}
