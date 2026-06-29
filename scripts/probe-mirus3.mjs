async function probeSwagger() {
  const paths = [
    '/swagger/index.html',
    '/swagger/v1/swagger.json',
    '/swagger/v1/swagger.yaml',
    '/openapi/v1.json',
    '/swagger.json',
  ];
  for (const p of paths) {
    const pr = await fetch('https://neo.mirus.ch' + p, { redirect: 'manual' });
    const ct = pr.headers.get('content-type') ?? '';
    console.log(pr.status, p, ct.split(';')[0]);
    if (pr.status === 200 && ct.includes('json')) {
      const j = await pr.text();
      console.log(j.slice(0, 500));
    }
  }
}
await probeSwagger();
