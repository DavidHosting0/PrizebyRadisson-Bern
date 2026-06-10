import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/openfoliomanagement.com.har', 'utf8'));

for (const e of har.log.entries) {
  const req = e.request?.postData?.text ?? '';
  if (!req.includes('FolioReservationSet')) continue;

  console.log('REQ:', req.match(/GET[^\r]+FolioReservationSet[^\r]+/)?.[0] ?? 'batch');

  const res = e.response?.content?.text ?? '';
  const idx = res.indexOf('FolioDetailsHeader');
  if (idx < 0) continue;

  const start = res.lastIndexOf('{"d":', idx);
  let depth = 0;
  for (let j = start; j < res.length && j < start + 200000; j++) {
    if (res[j] === '{') depth++;
    else if (res[j] === '}') {
      depth--;
      if (depth === 0) {
        const d = JSON.parse(res.slice(start, j + 1)).d;
        const headers = d.FolioDetailsHeader?.results ?? [];
        console.log('\nFolioReservationSet headers:', headers.length);
        const byFolio = new Map();
        for (const row of headers) {
          const f = row.Folio ?? '?';
          if (!byFolio.has(f)) byFolio.set(f, []);
          byFolio.get(f).push(row);
        }
        for (const [f, rows] of [...byFolio.entries()].sort()) {
          console.log(`\nFolio ${f}:`);
          for (const row of rows) {
            const vis =
              row.StatusCharge !== '02' && row.StatusCharge !== '03' ? 'SHOW' : 'HIDE';
            console.log(
              `  ${row.Id} ${row.Concept} StatusCharge=${row.StatusCharge} [${vis}]`,
            );
          }
        }
        console.log('\n---');
      }
    }
  }
}
