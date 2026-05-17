import { randomBytes } from 'node:crypto';

export const EMMA_ODATA_RSRVS_SRV = 'ZEYUI_RSRVS_SRV';
export const EMMA_ODATA_HOTEL_SRV = 'ZEYUI_HOTEL_SRV';
export const EMMA_DEFAULT_HOTEL_ID = 'CHBRNPR';
export const EMMA_DEFAULT_BUILDING_ID = '01';
export const EMMA_DEFAULT_SAP_CLIENT = '100';

const BATCH_HTTP_HEADERS = [
  'sap-cancel-on-close: true',
  'show-status: N',
  'sap-contextid-accept: header',
  'Accept-Language: en',
  'DataServiceVersion: 2.0',
  'MaxDataServiceVersion: 2.0',
  'X-Requested-With: XMLHttpRequest',
].join('\r\n');

export type EmmaODataBatchPartResult = {
  status: number;
  body: string;
  contentType: string | null;
};

function buildBatchGetPart(
  boundary: string,
  relativePath: string,
  csrfToken: string,
  accept: 'json' | 'plain' = 'json',
): string {
  const acceptHeader =
    accept === 'plain' ? 'Accept: text/plain, */*;q=0.5' : 'Accept: application/json';
  return [
    `--${boundary}`,
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    `GET ${relativePath} HTTP/1.1`,
    BATCH_HTTP_HEADERS,
    acceptHeader,
    `x-csrf-token: ${csrfToken}`,
    '',
    '',
  ].join('\r\n');
}

export function buildODataBatchBody(
  parts: Array<{ path: string; accept?: 'json' | 'plain' }>,
  csrfToken: string,
): { boundary: string; body: string; contentType: string } {
  const boundary = `batch_${randomBytes(6).toString('hex')}`;
  let body = '';
  for (const part of parts) {
    body += buildBatchGetPart(boundary, part.path, csrfToken, part.accept ?? 'json');
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
  const filter = encodeURIComponent(`HotelId eq '${hotelId}'`);
  return `RoomDetail?sap-client=${sapClient}&$skip=${skip}&$top=${top}&$filter=${filter}`;
}

export function roomDetailCountBatchPath(hotelId: string, sapClient: string): string {
  const filter = encodeURIComponent(`HotelId eq '${hotelId}'`);
  return `RoomDetail/$count?sap-client=${sapClient}&$filter=${filter}`;
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
