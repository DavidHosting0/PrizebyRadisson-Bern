async function probePaths() {
  const paths = [
    '/webapp/shifts/export',
    '/webapp/shifts/ical',
    '/webapp/shifts/calendar',
    '/webapp/shifts/week/2026-06-29',
    '/webapp/shifts/month/2026-06',
    '/webapp/shifts/team',
    '/webapp/shifts/overview',
    '/webapp/shifts/shiftplan',
    '/webapp/shifts/shiftplan/2026-06-29',
    '/webapp/api/v1/shifts',
    '/webapp/shifts/shift/2026-06-29/export',
    '/swagger',
    '/api',
    '/health',
  ];
  for (const p of paths) {
    const pr = await fetch('https://neo.mirus.ch' + p, { redirect: 'manual' });
    const ct = pr.headers.get('content-type') ?? '';
    console.log(pr.status, p, ct.split(';')[0]);
  }
}

async function showLoginForm() {
  const r = await fetch('https://neo.mirus.ch/Account/Login');
  const html = await r.text();
  const form = html.match(/<form[\s\S]*?<\/form>/i)?.[0]?.slice(0, 800);
  console.log('FORM:', form);
}

await showLoginForm();
await probePaths();
