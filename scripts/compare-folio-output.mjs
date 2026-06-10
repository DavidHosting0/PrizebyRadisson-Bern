import fs from 'node:fs';
import { extractFolioChargesFromDetailsHeader } from '../packages/shared/dist/folio-charges.js';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/foliomanagement.com.har', 'utf8'));

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
      if (depth === 0) return JSON.parse(chunk.slice(start, j + 1)).d;
    }
  }
  return null;
}

let headers = null;
for (const e of har.log.entries) {
  const res = e.response?.content?.text ?? '';
  if (!res.includes('FolioDetailsHeader')) continue;
  const d = parseJsonAfter(res, 'FolioDetailsHeader');
  if (d?.FolioDetailsHeader?.results?.length) {
    headers = d.FolioDetailsHeader.results;
    break;
  }
}

console.log('Headers:', headers.length);

// Show CTAX production dates
for (const h of headers.filter((x) => x.Concept === 'CTAX' || x.Concept === 'CTAX2')) {
  console.log(h.Id, h.Concept, h.Amount, h.ProductionDate, 'Folio', h.Folio);
}

const charges = extractFolioChargesFromDetailsHeader(headers);
const byFolio = Object.groupBy(charges, (c) => c.folioId ?? '?');

console.log('\n=== OUR APP OUTPUT ===');
for (const fid of ['01', '02']) {
  console.log(`\nFolio ${fid} (${(byFolio[fid] ?? []).length} charges):`);
  for (const c of byFolio[fid] ?? []) {
    console.log(`  ${c.id} ${c.concept ?? '(empty)'} ${c.amount} ${c.description}`);
  }
}

console.log('\n=== EMMA EXPECTED (simulation) ===');
function emmaVisible(row) {
  return row.StatusCharge !== '02' && row.StatusCharge !== '03';
}
function emmaCharges(headers) {
  const out = [];
  for (const h of headers) {
    if (!emmaVisible(h)) continue;
    const lines = h.FolioDetailsLine?.results ?? [];
    if (lines.length > 0) {
      for (const line of lines) {
        if (emmaVisible(line)) out.push({ folio: h.Folio, ...line });
      }
    } else {
      out.push({ folio: h.Folio, ...h });
    }
  }
  return out;
}
const expected = emmaCharges(headers);
const expByFolio = Object.groupBy(expected, (c) => c.folio);
for (const fid of ['01', '02']) {
  console.log(`\nFolio ${fid} (${(expByFolio[fid] ?? []).length} charges):`);
  for (const c of expByFolio[fid] ?? []) {
    console.log(`  ${c.Id} ${c.Concept ?? '(empty)'} ${c.Amount} ${c.Description}`);
  }
}
