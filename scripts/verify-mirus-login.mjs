/**
 * Verify production mirusLogin against live neo.mirus.ch using HAR credentials (not stored).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Compile-free: inline the same cookie check + login URL shape by importing built dist if present,
// otherwise replicate critical bits.
const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
const params = new URLSearchParams(har.log.entries[0].request.postData.text);
const username = params.get('Model.UserName');
const password = params.get('Model.Password');

const require = createRequire(import.meta.url);
let mirusLogin;
let MirusCookieJar;
try {
  ({ mirusLogin, MirusCookieJar } = require('../apps/api/dist/favur/mirus-http-auth.js'));
} catch {
  console.log('dist not built yet — run after api build');
  process.exit(2);
}

const jar = await mirusLogin('https://neo.mirus.ch', username, password);
console.log('login ok, hasAuth', jar.hasAuthCookie(), 'cookies', jar.cookieNames());
