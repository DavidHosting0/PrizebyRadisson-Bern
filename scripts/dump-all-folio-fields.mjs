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
      if (depth === 0) return JSON.parse(chunk.slice(start, j + 1)).d;
    }
  }
  return null;
}

const d = (() => {
  for (const e of har.log.entries) {
    const text = e.response?.content?.text ?? '';
    if (text.includes('0167888229') && text.includes('Content-Length: 46740')) {
      return parseJsonAfter(text, 'Content-Length: 46740');
    }
  }
  return null;
})();

if (!d) {
  console.log('not found');
  process.exit(1);
}

const fd = d.FolioDetails?.results ?? [];
console.log('All FolioDetails keys on first row:', Object.keys(fd[0] ?? {}).sort().join(', '));
console.log('\nFolioDetailsLine?', d.FolioDetailsLine ? 'yes' : 'no', d.FolioDetailsLine?.results?.length);

for (const r of fd) {
  console.log('\n---', r.Id, r.Concept, '---');
  for (const [k, v] of Object.entries(r).sort(([a], [b]) => a.localeCompare(b))) {
    if (k === '__metadata') continue;
    if (v && typeof v === 'object') continue;
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
}

console.log('\n=== Folio headers ===');
for (const f of d.Folios?.results ?? []) {
  console.log('\nFolio', f.Id, f.NameHolder);
  for (const [k, v] of Object.entries(f).sort(([a], [b]) => a.localeCompare(b))) {
    if (k === '__metadata' || k === 'Details') continue;
    if (v && typeof v === 'object') continue;
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
}
