async function main() {
  const r = await fetch('https://neo.mirus.ch/Account/Login', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
    redirect: 'manual',
  });
  console.log('status', r.status);
  console.log('location', r.headers.get('location'));
  const cookies =
    typeof r.headers.getSetCookie === 'function'
      ? r.headers.getSetCookie()
      : [r.headers.get('set-cookie')].filter(Boolean);
  console.log(
    'set-cookie names',
    cookies.map((c) => String(c).split('=')[0]),
  );
  const html = await r.text();
  console.log('html len', html.length);
  console.log('title', html.match(/<title[^>]*>([^<]+)/i)?.[1]);
  const forms = [...html.matchAll(/<form[^>]*>/gi)].map((m) => m[0]);
  console.log('forms', forms.slice(0, 8));
  const inputs = [...html.matchAll(/<input[^>]+>/gi)].map((m) =>
    m[0].replace(/\s+/g, ' ').slice(0, 220),
  );
  console.log('inputs', inputs);
  const buttons = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/gi)].map((m) =>
    m[0].replace(/\s+/g, ' ').slice(0, 220),
  );
  console.log('buttons', buttons.slice(0, 10));
  const hints = html.match(
    /microsoft|oauth|openid|external|saml|azure|entra|2fa|mfa|handler|Account\/|scheme/gi,
  );
  console.log('hints', [...new Set(hints || [])]);
  const links = [...html.matchAll(/href="([^"]+)"/gi)]
    .map((m) => m[1])
    .filter((h) => /account|login|external|microsoft|oauth|signin/i.test(h));
  console.log('auth links', [...new Set(links)].slice(0, 30));
  // also dump interesting data-* / form field names
  const names = [...html.matchAll(/name="([^"]+)"/gi)].map((m) => m[1]);
  console.log('field names', [...new Set(names)]);
  console.log('snippet', html.slice(0, 2500).replace(/\s+/g, ' '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
