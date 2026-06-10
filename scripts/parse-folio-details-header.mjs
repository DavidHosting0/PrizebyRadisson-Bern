import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/openfoliomanagement.com.har', 'utf8'));

function parseJsonAfter(text, marker) {
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const chunk = text.slice(idx, idx + 120000);
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

const MARKER = process.argv[2] ?? 'FolioDetailsHeader';

const d = (() => {
  for (const e of har.log.entries) {
    const text = e.response?.content?.text ?? '';
    if (!text.includes('0167888229')) continue;
    if (!text.includes(MARKER)) continue;
    const parsed = parseJsonAfter(text, MARKER);
    if (parsed?.FolioDetailsHeader || parsed?.FolioDetails) return parsed;
  }
  return null;
})();

if (!d) {
  console.log('not found');
  process.exit(1);
}

const headers = d.FolioDetailsHeader?.results ?? [];
console.log('FolioDetailsHeader count', headers.length);
console.log('Flat FolioDetails count', d.FolioDetails?.results?.length ?? 0);

const byFolio = new Map();
for (const h of headers) {
  const folio = h.Folio ?? '?';
  if (!byFolio.has(folio)) byFolio.set(folio, []);
  byFolio.get(folio).push(h);
}

for (const [folio, rows] of [...byFolio.entries()].sort()) {
  console.log(`\n=== Folio ${folio} (${rows.length} headers) ===`);
  for (const h of rows) {
    const lines = h.FolioDetailsLine?.results ?? h.FolioDetailsLine ?? [];
    const lineCount = Array.isArray(lines) ? lines.length : 0;
    const visible =
      h.StatusCharge !== '02' && h.StatusCharge !== '03' ? 'VISIBLE' : 'HIDDEN(02/03)';
    console.log(
      `  ${h.Id} ${h.Concept} StatusCharge=${h.StatusCharge} Status=${h.Status} lines=${lineCount} [${visible}]`,
    );
    if (lineCount > 0) {
      for (const line of lines) {
        const lv =
          line.StatusCharge !== '02' && line.StatusCharge !== '03' ? 'VISIBLE' : 'HIDDEN';
        console.log(
          `    line ${line.Id} ${line.Concept} StatusCharge=${line.StatusCharge} [${lv}]`,
        );
      }
    }
  }
}

// EMMA-visible simulation
console.log('\n=== EMMA UI simulation (exclude StatusCharge 02/03) ===');
for (const folioNum of [1, 2, 3, 4]) {
  const folioKey = String(folioNum).padStart(2, '0');
  const visible = headers.filter(
    (h) =>
      String(parseInt(h.Folio, 10)).padStart(2, '0') === folioKey &&
      h.StatusCharge !== '02' &&
      h.StatusCharge !== '03',
  );
  console.log(`Folio ${folioKey}: ${visible.length} charges`);
  for (const h of visible) {
    console.log(`  ${h.Id} ${h.Concept}`);
  }
}
