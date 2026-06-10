import fs from 'node:fs';

const harPath = process.argv[2] ?? 'c:/Users/ytmad/Downloads/foliomanagement.com.har';
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

function parseJsonAfter(text, marker) {
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const chunk = text.slice(Math.max(0, idx - 500), idx + 150000);
  const start = chunk.indexOf('{"d":');
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < chunk.length; j++) {
    if (chunk[j] === '{') depth++;
    else if (chunk[j] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(chunk.slice(start, j + 1)).d;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function odataResults(value) {
  if (!value || typeof value !== 'object') return [];
  const results = value.results;
  return Array.isArray(results) ? results : [];
}

function visible(row) {
  const sc = String(row.StatusCharge ?? '').trim();
  return sc !== '02' && sc !== '03';
}

console.log('HAR entries:', har.log.entries.length);

// Find FolioReservationSet responses
let folioSetCount = 0;
for (const e of har.log.entries) {
  const req = e.request?.postData?.text ?? e.request?.url ?? '';
  const res = e.response?.content?.text ?? '';
  if (!req.includes('FolioReservationSet') && !res.includes('FolioDetailsHeader')) continue;

  const d =
    parseJsonAfter(res, 'FolioDetailsHeader') ??
    parseJsonAfter(res, 'FolioReservationSet');
  if (!d?.FolioDetailsHeader) continue;

  folioSetCount++;
  const headers = odataResults(d.FolioDetailsHeader);
  console.log(`\n========== FolioReservationSet snapshot ${folioSetCount} (${headers.length} headers) ==========`);

  const byFolio = new Map();
  for (const h of headers) {
    const f = h.Folio ?? '?';
    if (!byFolio.has(f)) byFolio.set(f, []);
    byFolio.get(f).push(h);
  }

  for (const [folio, rows] of [...byFolio.entries()].sort()) {
    console.log(`\n--- Folio ${folio} ---`);
    for (const h of rows) {
      const lines = odataResults(h.FolioDetailsLine);
      const vis = visible(h) ? 'SHOW' : 'HIDE';
      console.log(
        `  HEADER ${h.Id} ${h.Concept} StatusCharge=${h.StatusCharge} Status=${h.Status} Amount=${h.Amount} Desc=${(h.Description ?? '').slice(0, 40)} [${vis}] lines=${lines.length}`,
      );
      for (const line of lines) {
        const lv = visible(line) ? 'SHOW' : 'HIDE';
        console.log(
          `    LINE ${line.Id} ${line.Concept} StatusCharge=${line.StatusCharge} Amount=${line.Amount} [${lv}]`,
        );
      }
    }
    const emmaVisible = rows.filter(visible);
    console.log(`  EMMA-visible count: ${emmaVisible.length}`);
  }
}

// Also find Reservations expand with FolioDetails
let resCount = 0;
for (const e of har.log.entries) {
  const res = e.response?.content?.text ?? '';
  if (!res.includes('FolioDetails') || !res.includes('ReservationId')) continue;
  const d = parseJsonAfter(res, '"FolioDetails"');
  if (!d?.FolioDetails && !d?.Folios) continue;
  const fd = odataResults(d.FolioDetails);
  if (fd.length === 0) continue;
  resCount++;
  console.log(`\n========== Reservations FolioDetails snapshot ${resCount} (${fd.length} rows) ==========`);
  const byFolio = new Map();
  for (const r of fd) {
    const f = r.Folio ?? '?';
    if (!byFolio.has(f)) byFolio.set(f, []);
    byFolio.get(f).push(r);
  }
  for (const [folio, rows] of [...byFolio.entries()].sort()) {
    console.log(`Folio ${folio}: ${rows.length} rows`);
    for (const r of rows) {
      console.log(`  ${r.Id} ${r.Concept} StatusCharge=${r.StatusCharge} Amount=${r.Amount}`);
    }
  }
  if (resCount >= 2) break;
}

// Reservation id
for (const e of har.log.entries) {
  const t = e.response?.content?.text ?? '';
  const m = t.match(/ReservationId='(\d+)'/);
  if (m) {
    console.log('\nReservationId:', m[1]);
    break;
  }
}
