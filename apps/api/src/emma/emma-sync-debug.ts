import type { Logger } from '@nestjs/common';
import type { EmmaRoomStatusSnapshot } from './emma-room-status-sync';
import type { ODataBatchPartSpec } from './emma-odata-client';

export type EmmaSyncDebug = {
  verbose: boolean;
  log: (message: string) => void;
  warn: (message: string) => void;
};

export function createEmmaSyncDebug(logger: Logger): EmmaSyncDebug {
  const verbose =
    process.env.EMMA_DEBUG === 'true' ||
    process.env.EMMA_DEBUG === '1' ||
    process.env.EMMA_DEBUG === 'verbose';
  return {
    verbose,
    log: (message) => {
      if (verbose) logger.log(message);
    },
    warn: (message) => logger.warn(message),
  };
}

/** Redact CSRF tokens in batch bodies for safe PM2 logs. */
export function redactBatchBodyForLog(body: string): string {
  return body
    .replace(/x-csrf-token:\s*[^\r\n]+/gi, 'x-csrf-token: [REDACTED]')
    .replace(/\r\n/g, '\\n')
    .slice(0, 2800);
}

/** Extract embedded GET request lines from a multipart batch body. */
export function extractBatchGetPaths(body: string): string[] {
  const paths: string[] = [];
  const re = /^GET\s+(.+?)\s+HTTP\/1\.[01]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    paths.push(m[1].trim());
  }
  return paths;
}

export function logBatchRequest(
  debug: EmmaSyncDebug | undefined,
  label: string,
  url: string,
  parts: ODataBatchPartSpec[],
  body: string,
  contentType: string,
): void {
  const paths = parts.map((p) => p.path);
  const embedded = extractBatchGetPaths(body);
  debug?.log(
    `[EMMA debug] $batch → label=${label} url=${url} contentType=${contentType} ` +
      `declaredParts=${paths.length} embeddedGET=${embedded.length}`,
  );
  for (let i = 0; i < paths.length; i++) {
    debug?.log(`[EMMA debug]   part[${i}] ${paths[i]} accept=${parts[i].accept ?? 'json'} showStatus=${parts[i].showStatus ?? 'N'}`);
  }
  if (verboseMismatch(debug, paths, embedded)) {
    debug?.warn(
      `[EMMA debug] $batch part path mismatch label=${label} declared=[${paths.join(' | ')}] embedded=[${embedded.join(' | ')}]`,
    );
  }
  debug?.log(`[EMMA debug] $batch body (${body.length} bytes): ${redactBatchBodyForLog(body)}`);
}

function verboseMismatch(
  debug: EmmaSyncDebug | undefined,
  declared: string[],
  embedded: string[],
): boolean {
  if (!debug?.verbose) return false;
  if (declared.length !== embedded.length) return true;
  return declared.some((p, i) => p !== embedded[i]);
}

export function logBatchResponse(
  debug: EmmaSyncDebug | undefined,
  label: string,
  raw: string,
): void {
  const parts = raw.split(/\r?\n--/);
  let idx = 0;
  for (const chunk of parts) {
    const statusMatch = chunk.match(/HTTP\/1\.[01]\s+(\d+)/);
    if (!statusMatch) continue;
    const status = statusMatch[1];
    const ctMatch = chunk.match(/Content-Type:\s*([^\r\n]+)/i);
    const bodyStart = chunk.search(/\r\n\r\n|\n\n/);
    const body =
      bodyStart >= 0 ? chunk.slice(bodyStart).replace(/^\r?\n\r?\n/, '').trim() : '';
    debug?.log(
      `[EMMA debug] $batch ← label=${label} part[${idx}] HTTP ${status} ct=${ctMatch?.[1]?.trim() ?? '?'} bodyLen=${body.length} ` +
        `preview=${body.slice(0, 120).replace(/\s+/g, ' ')}`,
    );
    idx += 1;
  }
}

export function logBatchHttpError(
  debug: EmmaSyncDebug | undefined,
  label: string,
  url: string,
  status: number,
  responseText: string,
  partPaths: string[],
  body: string,
): void {
  const embedded = extractBatchGetPaths(body);
  debug?.warn(
    `[EMMA debug] $batch HTTP ${status} label=${label} url=${url} ` +
      `parts=[${partPaths.join(' ;; ')}] embedded=[${embedded.join(' ;; ')}]`,
  );
  debug?.warn(`[EMMA debug] $batch error body: ${responseText.slice(0, 500)}`);
  debug?.warn(`[EMMA debug] $batch sent body: ${redactBatchBodyForLog(body)}`);
}

export function logRawRowSample(
  debug: EmmaSyncDebug | undefined,
  label: string,
  rows: Record<string, unknown>[],
  limit = 3,
): void {
  if (!debug?.verbose || rows.length === 0) return;
  for (const row of rows.slice(0, limit)) {
    const keys = Object.keys(row).filter((k) => !k.startsWith('__'));
    debug.log(
      `[EMMA debug] raw row (${label}) keys=[${keys.join(', ')}] sample=${JSON.stringify(row).slice(0, 400)}`,
    );
  }
}

export function logParsedSnapshots(
  debug: EmmaSyncDebug | undefined,
  snapshots: EmmaRoomStatusSnapshot[],
  skipped: Array<{ reason: string; rowKeys: string[] }>,
): void {
  if (!debug) return;
  debug.warn(
    `[EMMA debug] parse: ${snapshots.length} Zimmer erkannt, ${skipped.length} Zeilen übersprungen`,
  );
  for (const snap of snapshots.slice(0, 25)) {
    debug?.log(
      `[EMMA debug]   room emmaId=${snap.emmaRoomId} local=${snap.roomNumber} ` +
        `code=${snap.statusCode ?? '∅'} label=${snap.statusLabel ?? '∅'} ` +
        `ooo=${snap.outOfOrder} floor=${snap.floorId ?? '∅'}`,
    );
  }
  if (snapshots.length > 25) {
    debug?.log(`[EMMA debug]   … +${snapshots.length - 25} weitere Zimmer`);
  }
  for (const s of skipped.slice(0, 10)) {
    debug?.warn(`[EMMA debug] skipped: ${s.reason} keys=[${s.rowKeys.join(', ')}]`);
  }
}
