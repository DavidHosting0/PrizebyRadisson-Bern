import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/openfoliomanagement.com.har', 'utf8'));

function extractAllReservationJson(text) {
  const out = [];
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const markerIdx = text.indexOf('"FolioDetails"', searchFrom);
    if (markerIdx < 0) break;
    const start = text.lastIndexOf('{"d":', markerIdx);
    if (start < 0) break;
    let depth = 0;
    let parsed = null;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            parsed = JSON.parse(text.slice(start, i + 1));
          } catch {
            parsed = null;
          }
          searchFrom = i + 1;
          break;
        }
      }
    }
    if (parsed?.d) out.push(parsed.d);
    else break;
  }
  return out;
}

let n = 0;
for (const e of har.log.entries) {
  const text = e.response?.content?.text ?? '';
  if (!text.includes('0167888229') || !text.includes('FolioDetails')) continue;
  const all = extractAllReservationJson(text);
  for (const d of all) {
    n++;
    const fd = d.FolioDetails?.results ?? [];
    const folios = d.Folios?.results ?? [];
    console.log(`\n=== Snapshot ${n} ===`);
    console.log('FolioDetails:', fd.length, 'Folios headers:', folios.length);
    for (const f of folios) {
      console.log(
        '  Folio header',
        f.Id,
        'NameHolder=',
        f.NameHolder,
        'AmountDue=',
        f.AmountDue,
        'nested Details=',
        (f.Details?.results ?? []).length,
      );
    }
    const byFolio = new Map();
    for (const row of fd) {
      const fid = row.Folio ?? '?';
      if (!byFolio.has(fid)) byFolio.set(fid, []);
      byFolio.get(fid).push(row);
    }
    for (const [fid, rows] of [...byFolio.entries()].sort()) {
      console.log(`  FolioDetails assigned to Folio ${fid}:`);
      for (const row of rows) {
        console.log(`    ${row.Id} ${row.Concept} Status=${row.Status}`);
      }
    }
  }
}
