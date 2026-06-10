import fs from 'node:fs';

const harPath = process.argv[2] ?? 'c:/Users/ytmad/Downloads/foliomanagement.com.har';
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));

const posts = [];
for (const e of har.log.entries) {
  const req = e.request?.postData?.text ?? '';
  const res = e.response?.content?.text ?? '';
  const url = e.request?.url ?? '';
  const combined = req + url + res;
  if (
    combined.includes('ManageLocks') ||
    combined.includes('MoveCharge') ||
    combined.includes('ValidateMoveCharge') ||
    combined.includes('MERGE Draft') ||
    combined.includes('Apply')
  ) {
    posts.push({
      started: e.startedDateTime,
      method: e.request.method,
      url: url.slice(0, 120),
      req: req.slice(0, 600),
      status: e.response.status,
      res: res.slice(0, 400),
    });
  }
}

for (const p of posts) {
  console.log('\n===', p.started, p.method, p.status, '===');
  if (p.url) console.log('URL:', p.url);
  if (p.req) console.log('REQ:', p.req.replace(/\r\n/g, '\n'));
  if (p.res) console.log('RES:', p.res.replace(/\r\n/g, '\n'));
}
