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

export type EmmaODataBatchPartResult = {
  status: number;
  body: string;
  contentType: string | null;
};

export type ODataBatchPartSpec = {
  path: string;
  accept?: 'json' | 'plain';
  /** EMMA RoomStatus uses `show-status: Y` in the browser capture. */
  showStatus?: 'Y' | 'N';
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
  const showStatus = part.showStatus ?? 'N';
  return [
    `--${boundary}`,
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    `GET ${relativePath} HTTP/1.1`,
    'sap-cancel-on-close: true',
    `show-status: ${showStatus}`,
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
    const ctMatch = headerBlock.match(/Content-Type:\s*([^\r\n]+)/i);
    out.push({
      status,
      body,
      contentType: ctMatch?.[1]?.trim() ?? null,
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
