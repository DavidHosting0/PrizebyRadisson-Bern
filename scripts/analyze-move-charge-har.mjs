import fs from 'node:fs';

const har = JSON.parse(fs.readFileSync('c:/Users/ytmad/Downloads/movingcharges.com.har', 'utf8'));

console.log('Entries:', har.log.entries.length);

for (const [i, e] of har.log.entries.entries()) {
  const method = e.request.method;
  const url = e.request.url;
  const req = e.request.postData?.text ?? '';
  const res = e.response?.content?.text ?? '';
  const status = e.response.status;

  const interesting =
    method !== 'GET' ||
    req.includes('Move') ||
    req.includes('move') ||
    req.includes('Folio') ||
    url.includes('Move') ||
    url.includes('Folio') ||
    req.includes('changeset') ||
    req.includes('POST') ||
    req.includes('MERGE') ||
    req.includes('PUT');

  if (!interesting) continue;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`#${i} ${method} ${status} ${url.slice(0, 120)}`);
  if (req) {
    console.log('--- REQUEST ---');
    console.log(req.slice(0, 8000));
  }
  if (res && res.length < 5000) {
    console.log('--- RESPONSE ---');
    console.log(res);
  } else if (res) {
    console.log('--- RESPONSE (truncated) ---');
    console.log(res.slice(0, 3000));
  }
}
