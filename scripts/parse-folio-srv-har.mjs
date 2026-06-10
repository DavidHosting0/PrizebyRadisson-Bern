import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/openfoliomanagement.com.har', 'utf8'));

for (const e of har.log.entries) {
  if (!e.request.url.includes('ZEYUI_FOLIO_SRV/$batch')) continue;
  const req = e.request.postData?.text ?? '';
  const res = e.response?.content?.text ?? '';
  console.log('\n=== FOLIO_SRV batch request ===');
  const gets = req.match(/GET [^\r\n]+/g) ?? [];
  for (const g of gets.slice(0, 15)) console.log(g.slice(0, 200));
  console.log('--- responses with Charge/Detail/Folio ---');
  const parts = res.split(/HTTP\/1\.1 200 OK/);
  for (const part of parts) {
    if (!part.includes('"Concept"') && !part.includes('FolioDetail')) continue;
    const start = part.indexOf('{"d":');
    if (start < 0) continue;
    let depth = 0;
    for (let i = start; i < part.length; i++) {
      if (part[i] === '{') depth++;
      else if (part[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            const json = JSON.parse(part.slice(start, i + 1));
            const results = json.d?.results ?? (json.d && !json.d.results ? [json.d] : []);
            if (Array.isArray(results) && results.length > 0) {
              console.log('Result count:', results.length, 'sample keys:', Object.keys(results[0]).slice(0, 20).join(','));
              for (const row of results.slice(0, 6)) {
                console.log(
                  ' ',
                  row.Id ?? row.FolioId,
                  row.Concept,
                  'Folio=',
                  row.Folio ?? row.FolioId,
                  row.Description?.slice?.(0, 30),
                );
              }
            }
          } catch {
            /* ignore */
          }
          break;
        }
      }
    }
  }
}
