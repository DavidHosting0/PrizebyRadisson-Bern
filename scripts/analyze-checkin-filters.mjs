import fs from 'node:fs';

const har = JSON.parse(
  fs.readFileSync('c:/Users/ytmad/Downloads/arrivallistqueuelistcheckinsdonelist.com.har', 'utf8'),
);

for (const e of har.log.entries) {
  const req = e.request.postData?.text ?? '';
  const tab = req.match(/tms-filtertab:\s*(\S+)/i)?.[1];
  if (!tab) continue;
  const gets = req.match(/GET Reservations[^\r]+/g) ?? [];
  for (const g of gets) {
    const decoded = decodeURIComponent(g.replace(/^GET /, '').replace(/ HTTP\/1\.1$/, ''));
    console.log(`\n=== ${tab} ===`);
    console.log(decoded);
  }
}

// HotelOverview business date
for (const e of har.log.entries) {
  const res = e.response?.content?.text ?? '';
  if (!res.includes('HotelOverview')) continue;
  const idx = res.indexOf('"Arrivals"');
  if (idx < 0) continue;
  const start = res.lastIndexOf('{"d":', idx);
  let depth = 0;
  for (let j = start; j < res.length && j < start + 5000; j++) {
    if (res[j] === '{') depth++;
    else if (res[j] === '}') {
      depth--;
      if (depth === 0) {
        const d = JSON.parse(res.slice(start, j + 1)).d;
        console.log('\nHotelOverview:', JSON.stringify(d, null, 2));
        break;
      }
    }
  }
  break;
}
