import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const e of har.log.entries) {
  const res = e.response?.content?.text ?? '';
  if (!res.includes('FolioCharges') || !res.includes('000007')) continue;
  const marker = '"type":"ZEYUI_RSRVS_SRV.FolioCharges"';
  const idx = res.indexOf(marker);
  if (idx < 0) continue;
  const start = res.lastIndexOf('{"d":', idx);
  const chunk = res.slice(start, start + 1500);
  const folio = chunk.match(/"Folio":"([^"]*)"/)?.[1];
  const concept = chunk.match(/"Concept":"([^"]*)"/)?.[1];
  const id = chunk.match(/"Id":"([^"]*)"/)?.[1];
  console.log({ id, folio, concept, snippet: chunk.slice(0, 400) });
}
