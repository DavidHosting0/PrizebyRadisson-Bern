import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/openfoliomanagement.com.har', 'utf8'));

function extractAll(text) {
  const out = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const idx = text.indexOf('"FolioDetails"', searchFrom);
    if (idx < 0) break;
    const start = text.lastIndexOf('{"d":', idx);
    if (start < 0) break;
    let depth = 0;
    let parsed = null;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            parsed = JSON.parse(text.slice(start, i + 1)).d;
          } catch {
            parsed = null;
          }
          searchFrom = i + 1;
          break;
        }
      }
    }
    if (parsed) out.push(parsed);
    else break;
  }
  return out;
}

let idx = 0;
for (const e of har.log.entries) {
  const text = e.response?.content?.text ?? '';
  if (!text.includes('0167888229')) continue;
  for (const d of extractAll(text)) {
    const fd = d.FolioDetails?.results ?? [];
    if (fd.length === 0) continue;
    idx++;
    console.log(`\n=== snapshot ${idx} (${fd.length} charges) ===`);
    const byFolio = new Map();
    for (const row of fd) {
      const f = row.Folio ?? '?';
      if (!byFolio.has(f)) byFolio.set(f, []);
      byFolio.get(f).push(row);
    }
    for (const [f, rows] of [...byFolio.entries()].sort()) {
      console.log(`Folio ${f}:`);
      for (const row of rows) {
        console.log(
          `  ${row.Id} ${row.Concept} Status=${row.Status} StatusCharge=${row.StatusCharge} ProducedCharge=${row.ProducedCharge} NoMove=${row.NoMove}`,
        );
      }
    }
    for (const folio of d.Folios?.results ?? []) {
      console.log(
        `Header ${folio.Id} NameHolder=${folio.NameHolder} AmountDue=${folio.AmountDue} RespFolio=${folio.RespFolio}`,
      );
    }
  }
}
