/**
 * Runs in the page world so it can reach the open UI5 reservation.
 * A second OData RoomAssignment fails there: EMMA already holds the lock.
 */

type RoomControl = {
  setValue?: (value: string) => void;
  fireChange?: (params: { value: string; newValue: string }) => void;
  fireLiveChange?: (params: { value: string; newValue: string }) => void;
  getBindingContext?: () => {
    getPath?: () => string;
    getModel?: () => { setProperty?: (path: string, value: string) => void };
    getObject?: () => Record<string, unknown> | null | undefined;
  } | null;
};

type FillRequest = { room: string; requestId: string };
type FillResult = { requestId: string; error: string | null };

function ui5Core(): { byId: (id: string) => RoomControl | undefined } | null {
  const sapUi = (
    window as unknown as {
      sap?: { ui?: { getCore?: () => { byId: (id: string) => RoomControl | undefined } } };
    }
  ).sap?.ui;
  return sapUi?.getCore?.() ?? null;
}

function roomInput(): HTMLInputElement | null {
  const selectors = [
    '[id*="CheckInDetail"][id*="roomid.valuehelp-inner"]',
    '[id*="ReservationDetail"][id*="roomid.valuehelp-inner"]',
    '[id*="tms.checkin.roomid.valuehelp-inner"]',
    '[id*="tms.roomid.valuehelp-inner"]',
    '[id*="roomid.valuehelp-inner"]',
  ];
  for (const sel of selectors) {
    const input = document.querySelector<HTMLInputElement>(sel);
    if (input) return input;
  }
  return null;
}

function roomControl(input: HTMLInputElement): RoomControl | null {
  const core = ui5Core();
  if (!core) return null;
  const marked = input.closest('[data-sap-ui]')?.getAttribute('data-sap-ui');
  const ids = [marked, input.id.replace(/-inner$/, '')].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    const control = core.byId(id);
    if (control?.setValue) return control;
  }
  return null;
}

function writeRoom(control: RoomControl, value: string) {
  const ctx = control.getBindingContext?.();
  const model = ctx?.getModel?.();
  const path = ctx?.getPath?.();
  const obj = ctx?.getObject?.() ?? null;
  if (model?.setProperty && path && obj) {
    const key = 'RoomId' in obj ? 'RoomId' : 'roomId' in obj ? 'roomId' : null;
    if (key) model.setProperty(`${path}/${key}`, value);
  }
  control.setValue?.(value);
  control.fireLiveChange?.({ value, newValue: value });
  control.fireChange?.({ value, newValue: value });
}

type ListRow = { id: string; room: string };

function textProp(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function checkInListRows(): ListRow[] {
  const core = ui5Core();
  const tableEl = document.querySelector('table[id*="checkInList.table-table"]');
  if (!core || !tableEl) return [];
  const control = core.byId(tableEl.id.replace(/-table$/, '')) as {
    getBinding?: (name: string) => {
      getLength?: () => number;
      getContexts?: (start: number, length: number) => Array<{ getObject?: () => Record<string, unknown> | null }>;
    };
  };
  const binding = control?.getBinding?.('rows');
  const length = binding?.getLength?.() ?? 0;
  const contexts = binding?.getContexts?.(0, length) ?? [];
  const rows: ListRow[] = [];
  for (const ctx of contexts) {
    const obj = ctx?.getObject?.();
    if (!obj) continue;
    const id = textProp(obj, ['ReservationId', 'reservationId']);
    if (!id) continue;
    rows.push({ id, room: textProp(obj, ['RoomId', 'roomId', 'Room']) });
  }
  return rows.length === length && length > 0 ? rows : [];
}

document.addEventListener('prize-ra-checkin-rows', (event) => {
  const detail = (event as CustomEvent<{ requestId: string }>).detail;
  if (!detail?.requestId) return;
  let rows: ListRow[] = [];
  try {
    rows = checkInListRows();
  } catch {
    rows = [];
  }
  document.dispatchEvent(
    new CustomEvent('prize-ra-checkin-rows-done', {
      detail: { requestId: detail.requestId, rows },
    }),
  );
});

document.addEventListener('prize-ra-fill-room', (event) => {
  const detail = (event as CustomEvent<FillRequest>).detail;
  if (!detail?.requestId) return;
  let error: string | null = null;
  try {
    const input = roomInput();
    const control = input ? roomControl(input) : null;
    if (!input || !control) throw new Error('room field');
    writeRoom(control, detail.room);
    input.focus();
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(enter);
  } catch (err) {
    error = err instanceof Error ? err.message : 'room field';
  }
  document.dispatchEvent(
    new CustomEvent<FillResult>('prize-ra-fill-room-done', {
      detail: { requestId: detail.requestId, error },
    }),
  );
});
