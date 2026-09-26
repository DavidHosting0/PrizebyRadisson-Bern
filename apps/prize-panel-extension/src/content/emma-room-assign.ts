const HOTEL_ID = 'CHBRNPR';
const SAP_CLIENT = '100';
const SERVICE = 'ZEYUI_RSRVS_SRV';

export function padEmmaRoomId(roomNumber: string): string {
  const n = parseInt(roomNumber, 10);
  if (!Number.isFinite(n)) return roomNumber.trim();
  return String(n).padStart(4, '0');
}

/** Same shape as the API helper: hotel, three spaces, reservation id, local timestamp, 000. */
export function buildEmmaRequestObjectKey(hotelId: string, reservationId: string, at = new Date()): string {
  const pad = (n: number, len: number) => String(n).padStart(len, '0');
  const stamp = [
    pad(at.getFullYear(), 4),
    pad(at.getMonth() + 1, 2),
    pad(at.getDate(), 2),
    pad(at.getHours(), 2),
    pad(at.getMinutes(), 2),
    pad(at.getSeconds(), 2),
  ].join('');
  return `${hotelId}   ${reservationId}${stamp}000`;
}

function batchBody(actionPath: string, csrfToken: string, requestObjectKey: string): { body: string; contentType: string } {
  const hex = Math.random().toString(16).slice(2, 14).padEnd(12, '0');
  const batchBoundary = `batch_${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
  const changesetBoundary = `changeset_${hex.slice(2, 6)}-${hex.slice(6, 10)}-${hex.slice(0, 4)}`;
  const contentId = `id-${Date.now()}-1000`;
  let body = '\r\n';
  body += `--${batchBoundary}\r\n`;
  body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;
  body += `--${changesetBoundary}\r\n`;
  body += 'Content-Type: application/http\r\n';
  body += 'Content-Transfer-Encoding: binary\r\n\r\n';
  body += `POST ${actionPath} HTTP/1.1\r\n`;
  body += 'tms-fioriapp: CheckIn\r\n';
  body += `Request-Object-Key: ${requestObjectKey}\r\n`;
  body += 'Request-Object-Type: RSRV\r\n';
  body += 'sap-contextid-accept: header\r\n';
  body += 'Accept: application/json\r\n';
  body += `x-csrf-token: ${csrfToken}\r\n`;
  body += 'Accept-Language: en\r\n';
  body += 'DataServiceVersion: 2.0\r\n';
  body += 'MaxDataServiceVersion: 2.0\r\n';
  body += 'X-Requested-With: XMLHttpRequest\r\n';
  body += 'Content-Type: application/json\r\n';
  body += `Content-ID: ${contentId}\r\n\r\n`;
  body += '\r\n';
  body += `--${changesetBoundary}--\r\n\r\n`;
  body += `--${batchBoundary}--\r\n`;
  return { body, contentType: `multipart/mixed;boundary=${batchBoundary}` };
}

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(
    `${location.origin}/sap/opu/odata/sap/${SERVICE}/?sap-client=${SAP_CLIENT}`,
    {
      credentials: 'include',
      headers: {
        'x-csrf-token': 'Fetch',
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
    },
  );
  const token = res.headers.get('x-csrf-token');
  if (!res.ok || !token || token.toLowerCase() === 'required') {
    throw new Error('CSRF');
  }
  return token;
}

function innerError(body: string): string | null {
  const fail = body.match(/HTTP\/1\.[01] ([45]\d\d)[^\n]*\n([\s\S]*?)(?:\n--|\s*$)/);
  if (!fail) return null;
  const json = fail[2] ?? '';
  const message = json.match(/"message"\s*:\s*\{[^}]*"value"\s*:\s*"([^"]+)"/);
  return message?.[1] || `EMMA ${fail[1]}`;
}

/** POST RoomAssignment in the open EMMA session. Does nothing until the user accepts. */
export async function assignEmmaRoom(reservationId: string, roomNumber: string): Promise<void> {
  const csrf = await fetchCsrfToken();
  const roomId = padEmmaRoomId(roomNumber);
  const actionPath =
    `RoomAssignment?sap-client=${SAP_CLIENT}` +
    `&HotelId='${HOTEL_ID}'` +
    `&ReservationId='${reservationId}'` +
    `&RoomId='${roomId}'`;
  const batch = batchBody(actionPath, csrf, buildEmmaRequestObjectKey(HOTEL_ID, reservationId));
  const res = await fetch(
    `${location.origin}/sap/opu/odata/sap/${SERVICE}/$batch?sap-client=${SAP_CLIENT}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': batch.contentType,
        'x-csrf-token': csrf,
        Accept: 'multipart/mixed',
        'X-Requested-With': 'XMLHttpRequest',
        DataServiceVersion: '2.0',
        MaxDataServiceVersion: '2.0',
      },
      body: batch.body,
    },
  );
  const text = await res.text();
  const failed = innerError(text);
  if (!res.ok || failed) throw new Error(failed || `EMMA ${res.status}`);
}
