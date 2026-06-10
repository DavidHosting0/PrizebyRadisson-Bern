import fs from 'node:fs';

const har = JSON.parse(
  fs.readFileSync('c:/Users/ytmad/Downloads/arrivallistqueuelistcheckinsdonelist.com.har', 'utf8'),
);

console.log('Entries:', har.log.entries.length);

for (const [i, e] of har.log.entries.entries()) {
  const req = e.request.postData?.text ?? '';
  const url = e.request.url;

  const tab = req.match(/tms-filtertab:\s*(\S+)/i)?.[1];
  const app = req.match(/tms-fioriapp:\s*(\S+)/i)?.[1];
  if (!tab && !app && !req.includes('Reservations')) continue;

  console.log(`\n#${i} status=${e.response.status} tab=${tab ?? '-'} app=${app ?? '-'}`);
  const gets = req.match(/GET [^\r]+/g) ?? [];
  for (const g of gets.slice(0, 3)) {
    console.log(' ', g.length > 250 ? g.slice(0, 250) + '…' : g);
  }
}

const tabs = new Set();
for (const e of har.log.entries) {
  const req = e.request.postData?.text ?? '';
  for (const m of req.matchAll(/tms-filtertab:\s*(\S+)/gi)) tabs.add(m[1]);
}
console.log('\nAll filter tabs:', [...tabs]);
