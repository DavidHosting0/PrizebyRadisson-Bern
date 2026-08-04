import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mirusLogin } = require('../apps/api/dist/favur/mirus-http-auth.js');
// Re-require after rebuild
async function main() {
  // dynamic import of fresh sync after build
  delete require.cache[require.resolve('../apps/api/dist/favur/mirus-shift-sync.js')];
  delete require.cache[require.resolve('../apps/api/dist/favur/mirus-http-auth.js')];
  const { syncMirusShifts } = require('../apps/api/dist/favur/mirus-shift-sync.js');
  const { mirusLogin: login } = require('../apps/api/dist/favur/mirus-http-auth.js');

  const har = JSON.parse(readFileSync('c:/Users/ytmad/Downloads/mirus login.har', 'utf8'));
  const params = new URLSearchParams(har.log.entries[0].request.postData.text);

  const result = await syncMirusShifts({
    baseUrl: 'https://neo.mirus.ch',
    username: params.get('Model.UserName'),
    password: params.get('Model.Password'),
    windowDays: 2,
    session: null,
  });
  console.log('shifts', result.shifts.length);
  console.log(
    result.shifts.slice(0, 8).map((s) => ({
      name: s.favurDisplayName,
      id: s.favurUserId.slice(0, 36),
      start: s.startsAt.toISOString(),
      end: s.endsAt.toISOString(),
      label: s.label,
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
