import { readFileSync, writeFileSync } from 'node:fs';

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const entries = har.log.entries;

function summarizeHeaders(headers) {
  return Object.fromEntries(headers.map((h) => [h.name, h.value]));
}

function pick(entry, i) {
  const req = entry.request;
  const res = entry.response;
  const reqHeaders = summarizeHeaders(req.headers);
  const resHeaders = summarizeHeaders(res.headers);
  const setCookies = res.headers
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  const cookies = (req.cookies || []).map((c) => `${c.name}=${c.value.slice(0, 40)}…(${c.value.length})`);
  const out = {
    i,
    method: req.method,
    url: req.url,
    status: res.status,
    statusText: res.statusText,
    reqCookieHeader: reqHeaders.Cookie || reqHeaders.cookie || null,
    reqCookies: cookies,
    reqContentType: reqHeaders['Content-Type'] || reqHeaders['content-type'] || null,
    reqOrigin: reqHeaders.Origin || reqHeaders.origin || null,
    reqReferer: reqHeaders.Referer || reqHeaders.referer || null,
    reqAccept: reqHeaders.Accept || reqHeaders.accept || null,
    reqUserAgent: (reqHeaders['User-Agent'] || reqHeaders['user-agent'] || '').slice(0, 80),
    // all request header names
    reqHeaderNames: req.headers.map((h) => h.name),
    postData: req.postData
      ? {
          mimeType: req.postData.mimeType,
          text: req.postData.text,
          params: req.postData.params,
        }
      : null,
    resLocation: resHeaders.Location || resHeaders.location || null,
    setCookies: setCookies.map((c) => c.slice(0, 200)),
    setCookieNames: setCookies.map((c) => c.split('=')[0]),
    resContentType: resHeaders['Content-Type'] || resHeaders['content-type'] || null,
    resBodySize: res.content?.size,
    resBodyText: res.content?.text ? String(res.content.text).slice(0, 500) : null,
  };
  return out;
}

// Focus on login POST + Home GET
const focus = [0, 1].map((i) => pick(entries[i], i));
writeFileSync(
  'c:/Users/ytmad/Desktop/Housekeeping/scripts/mirus-login-har-summary.json',
  JSON.stringify(focus, null, 2),
);

// Also dump full POST body params decoded
const post = entries[0].request.postData;
console.log('=== LOGIN POST ===');
console.log('URL', entries[0].request.url);
console.log('status', entries[0].response.status, '→', entries[0].response.headers.find(h=>h.name.toLowerCase()==='location')?.value);
console.log('mime', post?.mimeType);
console.log('raw body:', post?.text);
if (post?.params) {
  for (const p of post.params) {
    const v = p.value ?? '';
    console.log(`param ${p.name} = ${v.length > 80 ? v.slice(0,80)+'…' : v} (len=${v.length})`);
  }
}
console.log('\nRequest cookies:');
for (const c of entries[0].request.cookies || []) {
  console.log(`  ${c.name} len=${c.value.length}`);
}
console.log('\nRequest headers of interest:');
for (const name of ['Cookie','Content-Type','Origin','Referer','Accept','User-Agent','Sec-Fetch-Site','Sec-Fetch-Mode','Sec-Fetch-User','Sec-Fetch-Dest','Cache-Control','Upgrade-Insecure-Requests']) {
  const h = entries[0].request.headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (h) console.log(`  ${h.name}: ${h.value.slice(0,200)}`);
}
console.log('\nSet-Cookie on login response:');
for (const h of entries[0].response.headers.filter((x)=>x.name.toLowerCase()==='set-cookie')) {
  console.log(' ', h.value.slice(0,250));
}

console.log('\n=== HOME GET ===');
console.log('URL', entries[1].request.url);
console.log('status', entries[1].response.status);
console.log('Request cookies:');
for (const c of entries[1].request.cookies || []) {
  console.log(`  ${c.name} len=${c.value.length}`);
}
console.log('Set-Cookie on home:');
for (const h of entries[1].response.headers.filter((x)=>x.name.toLowerCase()==='set-cookie')) {
  console.log(' ', h.value.slice(0,250));
}

// Check if GET login page is in HAR (maybe not - user started at POST)
console.log('\nAll unique URL paths:');
for (const e of entries) {
  console.log(e.request.method, e.response.status, e.request.url.replace('https://neo.mirus.ch','').slice(0,100));
}
