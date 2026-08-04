/**
 * After HTTP login, try Blazor negotiate + websocket and dump frames.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import WebSocket from 'ws';

const require = createRequire(import.meta.url);
const { mirusLogin, BROWSER_UA } = require('../apps/api/dist/favur/mirus-http-auth.js');

const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const params = new URLSearchParams(har.log.entries[0].request.postData.text);
const origin = 'https://neo.mirus.ch';
const jar = await mirusLogin(origin, params.get('Model.UserName'), params.get('Model.Password'));
const cookie = jar.headerFor(new URL(origin + '/'));

// First load the shift page HTML (starts circuit)
const pageRes = await fetch(`${origin}/webapp/shifts/shift`, {
  headers: {
    'User-Agent': BROWSER_UA,
    Cookie: cookie,
    Accept: 'text/html',
  },
  redirect: 'manual',
});
const html = await pageRes.text();
writeFileSync('c:/Users/ytmad/Desktop/Housekeeping/scripts/shift-page-http.html', html);
console.log('page', pageRes.status, 'len', html.length, 'cookies', jar.cookieNames());

// Blazor Server often embeds initial state; search for clues
const clues = [...html.matchAll(/Blazor|circuit|shift|Absence|Person|Schedule|prerender/gi)].map((m) => m[0]);
console.log('clues', [...new Set(clues)].slice(0, 30));

const negotiate = await fetch(`${origin}/_blazor/negotiate?negotiateVersion=1`, {
  method: 'POST',
  headers: {
    'User-Agent': BROWSER_UA,
    Cookie: cookie,
    'Content-Type': 'text/plain;charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'X-SignalR-User-Agent': 'Microsoft SignalR/8.0 (Blazor)',
  },
  body: '',
});
const negText = await negotiate.text();
console.log('negotiate', negotiate.status, negText.slice(0, 300));
let neg;
try {
  neg = JSON.parse(negText);
} catch {
  console.log('negotiate not json');
  process.exit(1);
}

const wsUrl = `wss://neo.mirus.ch/_blazor?id=${neg.connectionToken || neg.connectionId}`;
console.log('ws', wsUrl);

const frames = [];
await new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl, {
    headers: {
      Cookie: cookie,
      'User-Agent': BROWSER_UA,
      Origin: origin,
    },
  });
  const timer = setTimeout(() => {
    ws.close();
    resolve();
  }, 15000);
  ws.on('open', () => {
    console.log('ws open');
    // SignalR handshake
    ws.send('{"protocol":"blazorpack","version":1}\x1e');
  });
  ws.on('message', (data) => {
    const s = data.toString('utf8');
    frames.push(s.slice(0, 5000));
    console.log('<<', s.slice(0, 200).replace(/\s+/g, ' '));
  });
  ws.on('error', (err) => {
    console.log('ws err', err.message);
    clearTimeout(timer);
    reject(err);
  });
  ws.on('close', () => {
    clearTimeout(timer);
    resolve();
  });
});

writeFileSync(
  'c:/Users/ytmad/Desktop/Housekeeping/scripts/blazor-frames.json',
  JSON.stringify(frames, null, 2),
);
console.log('frames', frames.length);
