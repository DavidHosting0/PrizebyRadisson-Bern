import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/openfoliomanagement.com.har', 'utf8'));

function parseJsonAfter(text, marker) {
  const idx = text.indexOf(marker);
  if (idx < 0) return null;
  const chunk = text.slice(idx, idx + 100000);
  const start = chunk.indexOf('{"d":');
  if (start < 0) return null;
  let depth = 0;
  for (let j = start; j < chunk.length; j++) {
    if (chunk[j] === '{') depth++;
    else if (chunk[j] === '}') {
      depth--;
      if (depth === 0) {
        return JSON.parse(chunk.slice(start, j + 1)).d;
      }
    }
  }
  return null;
}

for (const e of har.log.entries) {
  const text = e.response?.content?.text ?? '';
  if (!text.includes('0167888229') || !text.includes('Content-Length: 46740')) continue;
  const d = parseJsonAfter(text, 'Content-Length: 46740');
  if (!d) continue;
  console.log('=== largest snapshot ===');
  const fd = d.FolioDetails?.results ?? [];
  console.log('FolioDetails', fd.length);
  for (const r of fd) {
    console.log(
      r.Id,
      r.Concept,
      'Folio',
      r.Folio,
      'StatusCharge',
      r.StatusCharge,
      'ProducedCharge',
      r.ProducedCharge,
    );
  }
  for (const f of d.Folios?.results ?? []) {
    console.log('Header', f.Id, f.NameHolder, 'due', f.AmountDue, 'total', f.AmountTotal);
    for (const det of f.Details?.results ?? []) {
      console.log(
        ' nested',
        f.Id,
        det.Id,
        det.Concept,
        'rowFolio',
        det.Folio,
        'StatusCharge',
        det.StatusCharge,
      );
    }
  }
  const rc = d.RoutingCharges?.results ?? [];
  console.log('RoutingCharges', rc.length);
  for (const r of rc) console.log(JSON.stringify(r));
  const fc = d.FixedCharges?.results ?? [];
  console.log('FixedCharges', fc.length);
  for (const r of fc.slice(0, 5)) console.log(JSON.stringify(r));
}
