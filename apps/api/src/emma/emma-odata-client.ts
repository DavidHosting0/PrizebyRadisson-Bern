import { randomBytes } from 'node:crypto';

export const EMMA_ODATA_RSRVS_SRV = 'ZEYUI_RSRVS_SRV';
export const EMMA_ODATA_HOTEL_SRV = 'ZEYUI_HOTEL_SRV';
export const EMMA_DEFAULT_HOTEL_ID = 'CHBRNPR';
export const EMMA_DEFAULT_BUILDING_ID = '01';
export const EMMA_DEFAULT_SAP_CLIENT = '100';

/** UI5-style $filter encoding: encodeURIComponent leaves `'` literal; SAP expects `%27`. */
export function encodeODataFilter(expr: string): string {
  return encodeURIComponent(expr).replace(/'/g, '%27');
}

function createBatchBoundary(): string {
  const hex = randomBytes(6).toString('hex');
  return `batch_${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

function createChangesetBoundary(): string {
  const hex = randomBytes(6).toString('hex');
  return `changeset_${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** OData string literal for EMMA action URLs: `'CHBRNPR'`. */
export function emmaODataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Request-Object-Key header used by EMMA Folio Management (browser HAR). */
export function buildEmmaRequestObjectKey(
  hotelId: string,
  reservationId: string,
  at = new Date(),
): string {
  const pad = (n: number, len: number) => String(n).padStart(len, '0');
  const stamp = [
    pad(at.getFullYear(), 4),
    pad(at.getMonth() + 1, 2),
    pad(at.getDate(), 2),
    pad(at.getHours(), 2),
    pad(at.getMinutes(), 2),
    pad(at.getSeconds(), 2),
  ].join('');
  const nonce = randomBytes(2).toString('hex');
  return `${hotelId}   ${reservationId}${stamp}${nonce}000`;
}

/** SetActivityTime — binds invoice/payment context to a reservation (payment HAR). */
export function setActivityTimePath(input: {
  sapClient: string;
  hotelId: string;
  reservationId: string;
  /** EMMA sub-action: '03' after showInvoicePopup, '04' before PaymentGateway. */
  subAction: '03' | '04';
  activityId?: string;
  status?: 'S' | 'F';
}): string {
  const q = emmaODataStringLiteral;
  const id = input.activityId?.trim() ?? '';
  const status = input.status ?? 'S';
  return (
    `SetActivityTime?sap-client=${input.sapClient}` +
    `&HotelId=${q(input.hotelId)}` +
    `&ReservationId=${q(input.reservationId)}` +
    `&Id=${q(id)}` +
    `&Channel=${q('NUI')}` +
    `&Action=${q('CO')}` +
    `&Status=${q(status)}` +
    `&Operation=${q('CO')}` +
    `&IsPickUp=${q('')}` +
    `&SubAction=${q(input.subAction)}` +
    `&Source=${q('SR')}`
  );
}

/** Single invoice entity (validation after CreateInvoice / before PaymentGateway). */
export function invoiceEntityPath(
  hotelId: string,
  invoiceNumber: string,
  sapClient: string,
): string {
  const q = emmaODataStringLiteral;
  return `Invoice(InvoiceNumber=${q(invoiceNumber)},HotelId=${q(hotelId)})?sap-client=${sapClient}`;
}

export function normalizeEmmaChargeRowId(value: string): string {
  const s = value.trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n).padStart(6, '0') : s;
}

export function emmaMoveDestinationFolioParam(folioId: string): string {
  const n = parseInt(folioId, 10);
  return Number.isFinite(n) ? String(n) : folioId.replace(/^0+/, '') || folioId;
}

export type ODataBatchPostPartSpec = {
  /** Relative action path including query string, e.g. MoveCharge?sap-client=100&... */
  actionPath: string;
  body?: string;
};

export type ODataChangesetBatchOpts = {
  requestObjectKey?: string;
  requestObjectType?: string;
  tmsFioriApp?: string;
};

/** Build OData $batch body with a single changeset POST (EMMA move charge HAR). */
export function buildODataChangesetBatchBody(
  posts: ODataBatchPostPartSpec[],
  csrfToken: string,
  opts?: ODataChangesetBatchOpts,
): { boundary: string; body: string; contentType: string } {
  const batchBoundary = createBatchBoundary();
  const changesetBoundary = createChangesetBoundary();
  const requestObjectKey = opts?.requestObjectKey;
  const requestObjectType = opts?.requestObjectType ?? 'RSRV';

  let body = '\r\n';
  body += `--${batchBoundary}\r\n`;
  body += `Content-Type: multipart/mixed; boundary=${changesetBoundary}\r\n\r\n`;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const contentId = `id-${Date.now()}-${1000 + i}`;
    body += `--${changesetBoundary}\r\n`;
    body += 'Content-Type: application/http\r\n';
    body += 'Content-Transfer-Encoding: binary\r\n\r\n';
    body += `POST ${post.actionPath} HTTP/1.1\r\n`;
    if (requestObjectKey) {
      body += `Request-Object-Key: ${requestObjectKey}\r\n`;
      body += `Request-Object-Type: ${requestObjectType}\r\n`;
    }
    body += 'X-Requested-With: XMLHttpRequest\r\n';
    body += 'sap-contextid-accept: header\r\n';
    body += 'Accept: application/json\r\n';
    body += `x-csrf-token: ${csrfToken}\r\n`;
    body += 'Accept-Language: en\r\n';
    body += 'DataServiceVersion: 2.0\r\n';
    body += 'MaxDataServiceVersion: 2.0\r\n';
    body += 'Content-Type: application/json\r\n';
    body += `Content-ID: ${contentId}\r\n\r\n`;
    body += post.body ?? '';
    body += '\r\n';
  }

  body += `--${changesetBoundary}--\r\n\r\n`;
  body += `--${batchBoundary}--\r\n`;
  return {
    boundary: batchBoundary,
    body,
    contentType: `multipart/mixed;boundary=${batchBoundary}`,
  };
}

export function validateMoveChargePath(input: {
  sapClient: string;
  hotelId: string;
  reservationId: string;
  sourceFolioId: string;
  chargeRowId: string;
}): string {
  const q = emmaODataStringLiteral;
  return (
    `ValidateMoveCharge?sap-client=${input.sapClient}` +
    `&HotelId=${q(input.hotelId)}` +
    `&ReservationId=${q(input.reservationId)}` +
    `&NumFolio=${q(input.sourceFolioId.padStart(2, '0'))}` +
    `&NumRow=${q(normalizeEmmaChargeRowId(input.chargeRowId))}`
  );
}

export function moveChargePath(input: {
  sapClient: string;
  hotelId: string;
  reservationId: string;
  sourceFolioId: string;
  chargeRowId: string;
  destinationFolioId: string;
  destinationReservationId: string;
  employee: string;
}): string {
  const q = emmaODataStringLiteral;
  const employee = input.employee.replace(/^0+/, '') || input.employee;
  return (
    `MoveCharge?sap-client=${input.sapClient}` +
    `&HotelId=${q(input.hotelId)}` +
    `&ReservationId=${q(input.reservationId)}` +
    `&NumFolio=${q(input.sourceFolioId.padStart(2, '0'))}` +
    `&NumRow=${q(normalizeEmmaChargeRowId(input.chargeRowId))}` +
    `&NumFolioD=${q(emmaMoveDestinationFolioParam(input.destinationFolioId))}` +
    `&ReserIdD=${q(input.destinationReservationId)}` +
    `&Employee=${q(employee)}`
  );
}

export function checkEmployeeAuthPath(
  sapClient: string,
  hotelId: string,
  employee: string,
  action = '0004',
): string {
  const q = emmaODataStringLiteral;
  const employeePadded = employee.replace(/^0+/, '').padStart(10, '0');
  return (
    `CheckEmployeeAuth?sap-client=${sapClient}` +
    `&HotelId=${q(hotelId)}` +
    `&Employee=${q(employeePadded)}` +
    `&Action=${q(action)}`
  );
}

/** ManageLocks ObjectKey query param (spaces → %20), matches Folio Management HAR. */
export function emmaManageLocksObjectKeyParam(requestObjectKey: string): string {
  return requestObjectKey.replace(/ /g, '%20');
}

export function manageLocksPath(input: {
  sapClient: string;
  hotelId: string;
  employee: string;
  requestObjectKey: string;
  lock: boolean;
  unlock?: boolean;
  forceLock?: boolean;
}): string {
  const q = emmaODataStringLiteral;
  const employeePadded = input.employee.replace(/^0+/, '').padStart(10, '0');
  const objectKey = emmaManageLocksObjectKeyParam(input.requestObjectKey);
  return (
    `ManageLocks?sap-client=${input.sapClient}` +
    `&ObjectType=${q('RSRV')}` +
    `&ObjectKey=${q(objectKey)}` +
    `&HotelId=${q(input.hotelId)}` +
    `&Employee=${q(employeePadded)}` +
    `&Lock=${q(input.lock ? 'true' : 'false')}` +
    `&ForceLock=${q(input.forceLock ? 'true' : 'false')}` +
    `&Unlock=${q(input.unlock ? 'true' : 'false')}`
  );
}

export function createDraftPath(sapClient: string): string {
  return `Draft?sap-client=${sapClient}`;
}

/** EMMA decimal action param: `5.34m` (used by Round / PaymentGateway Amount). */
export function emmaDecimalParam(amount: string | number): string {
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.'));
  const value = Number.isFinite(n) ? n : 0;
  return `${value.toFixed(2)}m`;
}

/** Strip leading zeros from an EMMA employee/operator code (PaymentGateway uses unpadded). */
function unpadEmployee(employee: string): string {
  return employee.replace(/^0+/, '') || employee;
}

/** showInvoicePopup (open invoice context for a folio). */
export function showInvoicePopupPath(input: {
  sapClient: string;
  hotelId: string;
  reservationId: string;
  folioId: string;
}): string {
  const q = emmaODataStringLiteral;
  return (
    `showInvoicePopup?sap-client=${input.sapClient}` +
    `&HotelId=${q(input.hotelId)}` +
    `&ReservaId=${q(input.reservationId)}` +
    `&Folio=${q(input.folioId.padStart(2, '0'))}`
  );
}

/** GetEmployeeTillID → Tills entity (resolves the operator's till). */
export function getEmployeeTillIdPath(input: {
  sapClient: string;
  hotelId: string;
  employee: string;
}): string {
  const q = emmaODataStringLiteral;
  const employeePadded = unpadEmployee(input.employee).padStart(10, '0');
  return (
    `GetEmployeeTillID?sap-client=${input.sapClient}` +
    `&HotelId=${q(input.hotelId)}` +
    `&Employee=${q(employeePadded)}`
  );
}

/** CreateInvoice → Invoice entity (InvoiceNumber). No email/print side effects by default. */
export function createInvoicePath(input: {
  sapClient: string;
  hotelId: string;
  reservationId: string;
  folioId: string;
  invoiceType?: string;
}): string {
  const q = emmaODataStringLiteral;
  return (
    `CreateInvoice?sap-client=${input.sapClient}` +
    `&HotelId=${q(input.hotelId)}` +
    `&ReservationId=${q(input.reservationId)}` +
    `&NumFolio=${q(input.folioId.padStart(2, '0'))}` +
    `&Fkart=${q('')}` +
    `&Lottery=${q('')}` +
    `&PrintInvoiceAsk=false` +
    `&ReservationEmail=${q('')}` +
    `&OtherEmail=${q('')}` +
    `&DefaultEmail=false` +
    `&NoEmail=true` +
    `&InvoiceType=${q(input.invoiceType ?? '0')}`
  );
}

/** Round → rounds the invoice for the chosen payment method (PG3 = token). */
export function roundInvoicePath(input: {
  sapClient: string;
  hotelId: string;
  invoiceNumber: string;
  paymentMethod: string;
  amount: string | number;
  currency: string;
}): string {
  const q = emmaODataStringLiteral;
  return (
    `Round?sap-client=${input.sapClient}` +
    `&Hotel=${q(input.hotelId)}` +
    `&InvoiceNumber=${q(input.invoiceNumber)}` +
    `&PaymentMethod=${q(input.paymentMethod)}` +
    `&Amount=${emmaDecimalParam(input.amount)}` +
    `&Currency=${q(input.currency)}`
  );
}

/** EMMA payment-gateway token (PG3) charge. Pinpad is empty (no physical terminal). */
export function paymentGatewayPath(input: {
  sapClient: string;
  hotelId: string;
  reservationId: string;
  invoiceNumber: string;
  folioId: string;
  employee: string;
  token: string;
  expiry: string;
  amount: string | number;
  currency: string;
  tillId: string;
  paymentMethod: string;
}): string {
  const q = emmaODataStringLiteral;
  const employee = unpadEmployee(input.employee);
  return (
    `PaymentGateway?sap-client=${input.sapClient}` +
    `&Hotel=${q(input.hotelId)}` +
    `&Reservation=${q(input.reservationId)}` +
    `&InvoiceNumber=${q(input.invoiceNumber)}` +
    `&FolioId=${q(input.folioId.padStart(2, '0'))}` +
    `&Employee=${q(employee)}` +
    `&Preauthorization=${q('')}` +
    `&Token=${q(input.token)}` +
    `&Expiry=${q(input.expiry)}` +
    `&Remarks=${q('')}` +
    `&Amount=${emmaDecimalParam(input.amount)}` +
    `&Currency=${q(input.currency)}` +
    `&TillId=${q(input.tillId)}` +
    `&Cashier=${q(employee)}` +
    `&PaymentMethod=${q(input.paymentMethod)}` +
    `&Pinpad=${q('')}` +
    `&SavePinpad=${q('')}` +
    `&RetainAmount=0m` +
    `&RetainCurrency=${q('')}` +
    `&RetainInvoice=${q('')}` +
    `&RetainFormaCobro=${q('')}` +
    `&Partial=${q('false')}`
  );
}

/** EMMA token payment method id (`PG3` = Token, vs `PG1` = Pinpad). */
export const EMMA_PAYMENT_METHOD_TOKEN = 'PG3';

export function draftCreateBody(hotelId: string, reservationId: string): string {
  return JSON.stringify({
    HotelId: hotelId,
    ReservationId: reservationId,
    __metadata: { type: 'ZEYUI_RSRVS_SRV.Draft' },
  });
}

export type EmmaODataBatchPartResult = {
  status: number;
  body: string;
  contentType: string | null;
  /** Lowercased response headers of the embedded HTTP part (e.g. `sap-message`). */
  headers: Record<string, string>;
};

export type ODataBatchPartSpec = {
  path: string;
  accept?: 'json' | 'plain';
  /** EMMA RoomStatus uses `show-status: Y` in the browser capture. */
  showStatus?: 'Y' | 'N';
  /** Check-In Fiori app sends `tms-fioriapp: CheckIn` on embedded GET parts. */
  checkInApp?: boolean;
  /** Search Reservations app (`openinhouse.com.har` → In House tab). */
  tmsFioriApp?: string;
  tmsFilterTab?: string;
};

function buildBatchGetPart(
  boundary: string,
  relativePath: string,
  csrfToken: string,
  part: ODataBatchPartSpec,
): string {
  const acceptHeader =
    part.accept === 'plain'
      ? 'Accept: text/plain, */*;q=0.5'
      : 'Accept: application/json';
  if (part.checkInApp) {
    return [
      `--${boundary}`,
      'Content-Type: application/http',
      'Content-Transfer-Encoding: binary',
      '',
      `GET ${relativePath} HTTP/1.1`,
      'sap-cancel-on-close: true',
      'tms-fioriapp: CheckIn',
      'sap-contextid-accept: header',
      acceptHeader,
      `x-csrf-token: ${csrfToken}`,
      'Accept-Language: en',
      'DataServiceVersion: 2.0',
      'MaxDataServiceVersion: 2.0',
      'X-Requested-With: XMLHttpRequest',
      '',
      '',
      '',
    ].join('\r\n');
  }
  const tmsHeaders: string[] = [];
  if (part.tmsFioriApp) {
    tmsHeaders.push(`tms-fioriapp: ${part.tmsFioriApp}`);
    if (part.tmsFilterTab) tmsHeaders.push(`tms-filtertab: ${part.tmsFilterTab}`);
  }
  const showStatus = part.tmsFioriApp ? null : (part.showStatus ?? 'N');
  return [
    `--${boundary}`,
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    `GET ${relativePath} HTTP/1.1`,
    'sap-cancel-on-close: true',
    ...(showStatus ? [`show-status: ${showStatus}`] : []),
    ...tmsHeaders,
    'sap-contextid-accept: header',
    acceptHeader,
    `x-csrf-token: ${csrfToken}`,
    'Accept-Language: en',
    'DataServiceVersion: 2.0',
    'MaxDataServiceVersion: 2.0',
    'X-Requested-With: XMLHttpRequest',
    '',
    '',
    '',
  ].join('\r\n');
}

/** Build a UI5-compatible OData v2 $batch body (leading CRLF + part order per browser). */
export function buildODataBatchBody(
  parts: ODataBatchPartSpec[],
  csrfToken: string,
): { boundary: string; body: string; contentType: string } {
  const boundary = createBatchBoundary();
  let body = '\r\n';
  for (const part of parts) {
    body += buildBatchGetPart(boundary, part.path, csrfToken, part);
  }
  body += `--${boundary}--\r\n`;
  return {
    boundary,
    body,
    contentType: `multipart/mixed;boundary=${boundary}`,
  };
}

/** Split a multipart/mixed OData batch response into embedded HTTP bodies. */
export function parseODataBatchResponse(raw: string): EmmaODataBatchPartResult[] {
  const out: EmmaODataBatchPartResult[] = [];
  const chunks = raw.split(/\r?\n--/);
  for (const chunk of chunks) {
    if (!chunk.trim() || chunk.trim() === '--') continue;
    const httpStart = chunk.search(/HTTP\/1\.[01]\s+\d+/);
    if (httpStart < 0) continue;
    const httpSection = chunk.slice(httpStart);
    const headerEnd = httpSection.indexOf('\r\n\r\n');
    const headerEndLf = headerEnd >= 0 ? headerEnd : httpSection.indexOf('\n\n');
    if (headerEndLf < 0) continue;
    const headerBlock = httpSection.slice(0, headerEndLf);
    const body = httpSection.slice(headerEndLf + (headerEnd >= 0 ? 4 : 2)).trim();
    const statusMatch = headerBlock.match(/HTTP\/1\.[01]\s+(\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const headers: Record<string, string> = {};
    for (const line of headerBlock.split(/\r?\n/)) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim().toLowerCase();
      if (!name || name.startsWith('http/')) continue;
      headers[name] = line.slice(idx + 1).trim();
    }
    out.push({
      status,
      body,
      contentType: headers['content-type'] ?? null,
      headers,
    });
  }
  return out;
}

export function parseODataResultsJson(body: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(body) as {
      d?: { results?: unknown[] };
      value?: unknown[];
    };
    if (Array.isArray(parsed.d?.results)) {
      return parsed.d.results.filter(
        (r): r is Record<string, unknown> => r != null && typeof r === 'object',
      );
    }
    if (Array.isArray(parsed.value)) {
      return parsed.value.filter(
        (r): r is Record<string, unknown> => r != null && typeof r === 'object',
      );
    }
  } catch {
    /* plain $count body */
  }
  return [];
}

export function parseODataCount(body: string): number | null {
  const trimmed = body.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const rows = parseODataResultsJson(body);
  if (rows.length === 1 && typeof rows[0].__count === 'number') {
    return rows[0].__count as number;
  }
  return null;
}

export function roomDetailBatchPath(
  hotelId: string,
  sapClient: string,
  skip: number,
  top: number,
): string {
  const filter = encodeODataFilter(`HotelId eq '${hotelId}'`);
  return `RoomDetail?sap-client=${sapClient}&$skip=${skip}&$top=${top}&$filter=${filter}`;
}

export function roomDetailCountBatchPath(hotelId: string, sapClient: string): string {
  const filter = encodeODataFilter(`HotelId eq '${hotelId}'`);
  return `RoomDetail/$count?sap-client=${sapClient}&$filter=${filter}`;
}

export function buildingsFloorsCountBatchPath(
  hotelId: string,
  buildingId: string,
  sapClient: string,
): string {
  return `Buildings(HotelId='${hotelId}',BuildingId='${buildingId}')/Floors/$count?sap-client=${sapClient}`;
}

export function buildingsFloorsListBatchPath(
  hotelId: string,
  buildingId: string,
  sapClient: string,
  skip = 0,
  top = 999,
): string {
  return `Buildings(HotelId='${hotelId}',BuildingId='${buildingId}')/Floors?sap-client=${sapClient}&$skip=${skip}&$top=${top}`;
}

export function roomStatusCountBatchPath(sapClient: string): string {
  return `RoomStatus/$count?sap-client=${sapClient}`;
}

export function roomStatusListBatchPath(
  sapClient: string,
  skip = 0,
  top = 999,
): string {
  return `RoomStatus?sap-client=${sapClient}&$skip=${skip}&$top=${top}`;
}

export function floorRoomDetailsCountBatchPath(
  hotelId: string,
  buildingId: string,
  floorId: string,
  sapClient: string,
): string {
  const key = `Floors(HotelId='${hotelId}',BuildingId='${buildingId}',FloorId='${floorId}')`;
  return `${key}/RoomDetails/$count?sap-client=${sapClient}&search=`;
}

export function floorRoomDetailsBatchPath(
  hotelId: string,
  buildingId: string,
  floorId: string,
  sapClient: string,
  skip: number,
  top: number,
): string {
  const key = `Floors(HotelId='${hotelId}',BuildingId='${buildingId}',FloorId='${floorId}')`;
  return `${key}/RoomDetails?sap-client=${sapClient}&$skip=${skip}&$top=${top}&search=`;
}

/** EMMA Check-In app reservation list $select (from browser HAR — no RateCode etc.). */
export const RESERVATION_LIST_SELECT = [
  'ReservationId',
  'RoomId',
  'Tier',
  'Stays',
  'Guests',
  'RoomType',
  'MealPlan',
  'ArrivalDate',
  'NightsStay',
  'DepartureDate',
  'CIStatusSigned',
  'MainClientName',
  'GroupId',
  'BookingFileId',
  'Stayover',
  'OriginalRoomType',
  'RoomTypeUpg',
  'GroupName',
  'NoMove',
  'CheckInQDate',
  'VipDesc',
  'PreAuthAmount',
  'CreditCard',
  'CardHolder',
  'CardExpiry',
  'HotelId',
  'NumPax1',
  'NumPax2',
  'NumPax3',
  'NumPax4',
  'CheckIn',
  'CheckOut',
  'CheckInQueue',
  'Draft/Status',
  'Draft/LockedByUserFullName',
  'MainGuestName',
  'MainGuestId',
  'ResTypeId',
  'Paid',
  'Type',
  'MealPlanUpg',
  'ExpectedArrivalTime',
  'ExpectedDepartureTime',
].join(',');

export type CheckInDateTab = 'arrivals' | 'queue' | 'checkInsDone';
export type ReservationListTab = CheckInDateTab | 'inhouse';

export const CHECKIN_TAB_FILTER_LABEL: Record<CheckInDateTab, string> = {
  arrivals: 'Arrivals',
  queue: 'Waiting',
  checkInsDone: 'CheckInsDone',
};

export function reservationListBatchPath(
  hotelId: string,
  sapClient: string,
  tab: ReservationListTab,
  arrivalDateIso: string,
  skip = 0,
  top = 500,
): string {
  const dateFilter = `datetime'${arrivalDateIso}T00:00:00'`;
  const base = `HotelId eq '${hotelId}' and Type eq '0' and CheckOut eq false`;
  let tabFilter: string;
  switch (tab) {
    case 'arrivals':
      // EMMA Check-In → Arrivals tab (business date, not in queue, not checked in).
      tabFilter = `${base} and ArrivalDate eq ${dateFilter} and CheckInQueue eq false and CheckIn eq false`;
      break;
    case 'queue':
      tabFilter = `${base} and ArrivalDate eq ${dateFilter} and CheckInQueue eq true and CheckIn eq false`;
      break;
    case 'checkInsDone':
      tabFilter = `${base} and ArrivalDate eq ${dateFilter} and CheckIn eq true and CheckInDate eq ${dateFilter}`;
      break;
    case 'inhouse':
      // Broader than arrivals/queue: in-house guests may not use Type eq '0'.
      tabFilter = `HotelId eq '${hotelId}' and CheckOut eq false and CheckIn eq true`;
      break;
  }
  const filter = encodeODataFilter(tabFilter);
  const select = encodeURIComponent(RESERVATION_LIST_SELECT);
  return `Reservations?sap-client=${sapClient}&$skip=${skip}&$top=${top}&$orderby=${encodeURIComponent('MainGuestName asc')}&$filter=${filter}&$select=${select}`;
}

/** Search Reservations Fiori app id (openinhouse.com.har). */
export const EMMA_FIORI_APP_RESERVATIONS = 'Reservations';

/** EMMA Search Reservations → In House (openinhouse.com.har). */
export const INHOUSE_STATUS_CODES = ['09', '06', '05', '03', '02', '01'] as const;

/** $select from openinhouse.com.har In House tab (GuestsListSet omitted — needs $expand). */
export const INHOUSE_HAR_SELECT = [
  'ReservationId',
  'ArrivalDate',
  'NightsStay',
  'DepartureDate',
  'Tier',
  'Stays',
  'MainGuestName',
  'TotalPax',
  'RoomType',
  'RoomId',
  'MealPlan',
  'StatusCI',
  'CIChannel',
  'OCIdone',
  'Rate',
  'MainClientName',
  'GroupId',
  'BookingFileId',
  'OriginalRoomType',
  'Stayover',
  'RoomTypeUpg',
  'VipDesc',
  'HotelId',
  'Type',
  'NumPax1',
  'NumPax2',
  'NumPax3',
  'NumPax4',
  'CheckIn',
  'CheckOut',
  'GroupName',
  'Status',
  'MainGuestId',
  'Draft/Status',
  'Draft/LockedByUserFullName',
  'IsEditableInFiori',
  'NoMove',
  'AllowChangeStatus',
  'OCOdone',
  'ExpectedArrivalTime',
  'ExpectedDepartureTime',
  'RoomDetails/Status',
  'Paid',
  'MealPlanUpg',
].join(',');

/** UI placeholder filters from HAR (empty RoomId / MainGuestName = no user filter). */
function inHouseHarUiFilter(hotelId: string): string {
  return `HotelId eq '${hotelId}' and RoomId eq '' and MainGuestName eq ''`;
}

/** Primary In House list — HAR InHouse tab (`tms-filtertab: InHouse`, no Status filter). */
export function inHouseListBatchPath(
  hotelId: string,
  sapClient: string,
  skip = 0,
  top = 500,
): string {
  const filter = encodeODataFilter(inHouseHarUiFilter(hotelId));
  const select = encodeURIComponent(INHOUSE_HAR_SELECT);
  return `Reservations?sap-client=${sapClient}&$skip=${skip}&$top=${top}&$orderby=${encodeURIComponent('MainGuestName asc')}&$filter=${filter}&$select=${select}`;
}

/** Fallback: status filter from HAR Overview tab (count / secondary fetch). */
export function inHouseStatusListBatchPath(
  hotelId: string,
  sapClient: string,
  skip = 0,
  top = 500,
): string {
  const statusFilter = INHOUSE_STATUS_CODES.map((s) => `Status eq '${s}'`).join(' or ');
  const tabFilter = `(${statusFilter}) and ${inHouseHarUiFilter(hotelId)}`;
  const filter = encodeODataFilter(tabFilter);
  const select = encodeURIComponent(INHOUSE_HAR_SELECT);
  return `Reservations?sap-client=${sapClient}&$skip=${skip}&$top=${top}&$orderby=${encodeURIComponent('MainGuestName asc')}&$filter=${filter}&$select=${select}`;
}

/** Last-resort fallback when HAR In House tab returns 0 rows. */
export function inHouseCheckInFallbackBatchPath(
  hotelId: string,
  sapClient: string,
  skip = 0,
  top = 500,
): string {
  const tabFilter = `HotelId eq '${hotelId}' and CheckOut eq false and CheckIn eq true`;
  const filter = encodeODataFilter(tabFilter);
  const select = encodeURIComponent(INHOUSE_HAR_SELECT);
  return `Reservations?sap-client=${sapClient}&$skip=${skip}&$top=${top}&$orderby=${encodeURIComponent('MainGuestName asc')}&$filter=${filter}&$select=${select}`;
}

export function hotelOverviewBatchPath(hotelId: string, sapClient: string): string {
  return `HotelOverview('${hotelId}')?sap-client=${sapClient}`;
}

function reservationEntityKey(hotelId: string, reservationId: string): string {
  return `Reservations(HotelId='${hotelId}',ReservationId='${reservationId}')`;
}

/** Guest $select from EMMA Check-In open-reservation HAR. */
export const RESERVATION_GUEST_SELECT = [
  'ClientId',
  'Name',
  'Program',
  'CardNumber',
  'Stays',
  'ArrivalDate',
  'DepartureDate',
  'MealPlan',
  'MealPlanUpg',
  'PaxType',
  'GuestId',
  'Gender',
  'VIPDesc',
  'Mail',
  'Telephone',
  'Category',
  'MainGuest',
  'Title',
  'FirstName',
  'Surname',
  'Mobile',
  'City',
  'Country',
  'Region',
  'TaxNumber',
  'BirthDate',
  'Destination',
  'UnkownDestination',
  'DestinationAddress',
  'PostalCode',
  'Street',
  'HouseNumber',
  'Nationality',
  'BirthPlace',
  'DocType',
  'Expeditor',
  'NumDoc',
  'DocIssueDate',
  'DocExpiryDate',
  'IssueDate',
  'ExpiryDate',
  'Profession',
  'Address',
  'TaxNumber2',
  'BirthProvince',
  'FatherName',
  'MotherName',
].join(',');

export function reservationDetailBatchPaths(
  hotelId: string,
  reservationId: string,
  sapClient: string,
): ODataBatchPartSpec[] {
  const key = reservationEntityKey(hotelId, reservationId);
  const guestSelect = encodeURIComponent(RESERVATION_GUEST_SELECT);
  return [
    { path: `${key}?sap-client=${sapClient}`, checkInApp: true },
    {
      path: `${key}/Guests?sap-client=${sapClient}&$skip=0&$top=999&$select=${guestSelect}`,
      checkInApp: true,
    },
    { path: `${key}/CreditCards?sap-client=${sapClient}&$skip=0&$top=999`, checkInApp: true },
    {
      path: `${key}/Preauthorizations?sap-client=${sapClient}&$skip=0&$top=999`,
      checkInApp: true,
    },
    {
      path: `${key}/RoomList?sap-client=${sapClient}&$skip=0&$top=999&$orderby=${encodeURIComponent('Floor asc')}`,
      checkInApp: true,
    },
    {
      path: `${key}/ResLoyaltyBenefits?sap-client=${sapClient}&$skip=0&$top=999`,
      checkInApp: true,
    },
    { path: `${key}/PoliceRecords?sap-client=${sapClient}&$skip=0&$top=999`, checkInApp: true },
  ];
}

/**
 * Extract an OData v2 error message from a (changeset) response body.
 * EMMA returns `{"error":{"message":{"value":"Error: Not sufficient funds"}}}`
 * on a declined gateway charge. Returns null when no error object is present.
 */
export function extractODataErrorMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: { value?: string } | string };
    };
    const err = parsed.error;
    if (!err) return null;
    if (typeof err.message === 'string') return err.message.trim() || 'EMMA error';
    const value = err.message?.value;
    return (value && value.trim()) || 'EMMA error';
  } catch {
    return null;
  }
}

export function parseODataEntityJson(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body) as { d?: Record<string, unknown> & { results?: unknown[] } };
    const d = parsed.d;
    if (!d || Array.isArray(d.results)) return null;
    return d;
  } catch {
    return null;
  }
}

/** CreditCards (incl. Token) for a reservation — used transiently for VCC charging. */
export function reservationCreditCardsPath(
  hotelId: string,
  reservationId: string,
  sapClient: string,
): string {
  const key = reservationEntityKey(hotelId, reservationId);
  return `${key}/CreditCards?sap-client=${sapClient}&$skip=0&$top=999`;
}

/** Existing invoices for a reservation (to detect/reuse an already-created invoice). */
export function reservationInvoicesPath(
  hotelId: string,
  reservationId: string,
  sapClient: string,
): string {
  const key = reservationEntityKey(hotelId, reservationId);
  return `${key}/Invoices?sap-client=${sapClient}&$skip=0&$top=999`;
}

/**
 * EMMA CreateInvoice returns the new invoice number in the `sap-message` response
 * header (the entity body's InvoiceNumber is empty). Parse it from the header map.
 */
export function invoiceNumberFromSapMessage(
  headers: Record<string, string> | undefined,
): string | null {
  const raw = headers?.['sap-message'];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { message?: string; severity?: string };
    const msg = (parsed.message ?? '').trim();
    if (!msg) return null;
    // Real invoice numbers look like "AIS6X02302"; ignore obvious error text.
    if (/^[A-Z0-9]{6,12}$/.test(msg)) return msg;
    return null;
  } catch {
    return null;
  }
}

/** FolioReservationSet expand — same charge list EMMA folio UI uses. */
export const FOLIO_RESERVATION_EXPAND = [
  'FolioDetailsHeader',
  'FolioDetailsHeader/FolioDetailsLine',
].join(',');

export function folioReservationSetPath(
  hotelId: string,
  reservationId: string,
  sapClient: string,
): string {
  const expand = encodeURIComponent(FOLIO_RESERVATION_EXPAND);
  return `FolioReservationSet(HotelId='${hotelId}',ReservationId='${reservationId}')?sap-client=${sapClient}&$expand=${expand}`;
}

/** Folio Management $expand from EMMA folio HAR (read-only GET). */
export const RESERVATION_FOLIO_EXPAND = [
  'MainCustomer',
  'Folios',
  'FolioDetails',
  'Messages',
  'Amount',
  'LoanedItems',
  'Notices',
  'MainGuest',
  'RoomDetails',
  'Guests',
].join(',');

export function reservationFolioBatchPaths(
  hotelId: string,
  reservationId: string,
  sapClient: string,
): ODataBatchPartSpec[] {
  const key = reservationEntityKey(hotelId, reservationId);
  const expand = encodeURIComponent(RESERVATION_FOLIO_EXPAND);
  const hotelFilter = encodeODataFilter(`HotelId eq '${hotelId}'`);
  return [
    { path: `${key}?sap-client=${sapClient}&$expand=${expand}` },
    { path: folioReservationSetPath(hotelId, reservationId, sapClient) },
    { path: `Remarks(HotelId='${hotelId}',ReservationId='${reservationId}',Id='ALL')?sap-client=${sapClient}` },
    { path: `DepositConcept?sap-client=${sapClient}&$filter=${hotelFilter}` },
  ];
}
