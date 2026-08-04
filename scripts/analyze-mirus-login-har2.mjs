import { readFileSync } from 'node:fs';

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const e0 = har.log.entries[0];
const e1 = har.log.entries[1];

console.log('=== POST ALL request headers ===');
for (const h of e0.request.headers) console.log(`${h.name}: ${h.value.slice(0, 300)}`);

console.log('\n=== POST ALL response headers ===');
for (const h of e0.response.headers) console.log(`${h.name}: ${h.value.slice(0, 400)}`);

console.log('\n=== POST cookies array ===', JSON.stringify(e0.request.cookies, null, 2));
console.log('=== POST response cookies array ===', JSON.stringify(e0.response.cookies, null, 2));

console.log('\n=== HOME ALL request headers ===');
for (const h of e1.request.headers) console.log(`${h.name}: ${h.value.slice(0, 300)}`);

console.log('\n=== HOME ALL response headers ===');
for (const h of e1.response.headers) console.log(`${h.name}: ${h.value.slice(0, 400)}`);

console.log('\n=== HOME request cookies ===', JSON.stringify(e1.request.cookies, null, 2));
console.log('=== HOME response cookies ===', JSON.stringify(e1.response.cookies, null, 2));

// check pages / startedDateTime — maybe login GET is missing because capture started mid-flow
console.log('\npages', har.log.pages);
console.log('browser', har.log.browser);
console.log('creator', har.log.creator);

// look for any cookie-like fields in post body encoding
const text = e0.request.postData.text;
console.log('\nbody raw:', text);
console.log('body decoded:', decodeURIComponent(text.replace(/\+/g, ' ')));

// Compare: does URLSearchParams encode the same way?
const params = new URLSearchParams();
params.set('_handler', 'login');
params.set('__RequestVerificationToken', 'TOKEN');
params.set('Model.UserName', 'davideich2006@gmail.com');
params.set('Model.Password', 'MaDaJo2006???');
console.log('\nURLSearchParams sample:', params.toString());
console.log('note: @ ->', encodeURIComponent('@'), ' ? ->', encodeURIComponent('?'));
