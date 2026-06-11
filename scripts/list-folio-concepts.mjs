import fs from 'node:fs';

const paths = process.argv.slice(2);
const set = new Set();
for (const p of paths) {
  const har = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const e of har.log.entries) {
    const t = e.response?.content?.text ?? '';
    const rx = /"Concept":"([^"]*)"[^}]{0,500}?"Description":"([^"]*)"/g;
    let m;
    while ((m = rx.exec(t))) set.add(`${m[1]} | ${m[2]}`);
  }
}
console.log([...set].sort().join('\n'));
