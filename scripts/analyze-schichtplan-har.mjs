import { readFileSync, writeFileSync } from 'node:fs';

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/schichtplan.har', 'utf8'));
const ents = har.log.entries;
console.log('entries', ents.length);
console.log('pages', har.log.pages);

for (const [i, e] of ents.entries()) {
  const req = e.request;
  const res = e.response;
  console.log('\n====', i, req.method, req.url);
  console.log('status', res.status, res.statusText);
  console.log('req headers:');
  for (const h of req.headers) {
    if (/cookie/i.test(h.name)) {
      console.log(' ', h.name + ':', h.value.split(';').map((p) => p.trim().split('=')[0]).join('; '));
    } else {
      console.log(' ', h.name + ':', h.value.slice(0, 200));
    }
  }
  console.log('req cookies count', (req.cookies || []).length, (req.cookies || []).map((c) => c.name));
  if (req.postData) {
    console.log('post mime', req.postData.mimeType);
    console.log('post text', (req.postData.text || '').slice(0, 500));
  }
  console.log('res headers:');
  for (const h of res.headers) {
    console.log(' ', h.name + ':', h.value.slice(0, 250));
  }
  const body = res.content?.text;
  console.log('body size', res.content?.size, 'encoding', res.content?.encoding, 'mime', res.content?.mimeType);
  if (body) {
    const decoded = res.content.encoding === 'base64' ? Buffer.from(body, 'base64').toString('utf8') : body;
    console.log('body preview', decoded.slice(0, 400).replace(/\s+/g, ' '));
    if (i === 0 || /json|blazor|shift|api/i.test(req.url + (res.content?.mimeType || ''))) {
      writeFileSync(
        `c:/Users/ytmad/Desktop/Housekeeping/scripts/har-shift-entry-${i}.txt`,
        decoded.slice(0, 200000),
      );
    }
  }
}

// Also look at websocket if any
const ws = ents.filter((e) => /wss:|_blazor|websocket/i.test(e.request.url) || e._webSocketMessages);
console.log('\nwebsocket-ish', ws.length);
for (const e of ws) {
  console.log(e.request.url, e._webSocketMessages?.length);
  if (e._webSocketMessages) {
    for (const m of e._webSocketMessages.slice(0, 30)) {
      console.log(' WS', m.type, String(m.data).slice(0, 200));
    }
  }
}
