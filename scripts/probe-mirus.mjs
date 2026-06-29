async function probe() {
  const r = await fetch('https://neo.mirus.ch/Account/Login');
  const html = await r.text();
  const token =
    html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/i)?.[1] ||
    html.match(/value="([^"]+)"[^>]*name="__RequestVerificationToken"/i)?.[1];
  console.log('status', r.status);
  console.log('set-cookie', r.headers.get('set-cookie')?.slice(0, 200));
  console.log('token', token?.slice(0, 50));
  const inputs = [...html.matchAll(/<input[^>]+>/gi)].map((m) => m[0].slice(0, 140));
  console.log('inputs', inputs);
  const paths = [
    '/api/shifts',
    '/webapp/api/shifts',
    '/odata/Shifts',
    '/webapp/shifts/data',
    '/webapp/shifts/week',
    '/webapp/shifts/shift/2026-06-29',
  ];
  for (const p of paths) {
    const pr = await fetch('https://neo.mirus.ch' + p, { redirect: 'manual' });
    console.log(p, pr.status, pr.headers.get('location')?.slice(0, 80) ?? '');
  }
}
probe().catch(console.error);
