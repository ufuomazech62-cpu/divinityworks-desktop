const fs = require('fs');
const path = require('path');

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
let css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');

// Inline image assets as base64 data URIs so the Worker is fully self-contained
// (no separate asset routes needed). Uses the real desktop app logo + icon.
const inlineImg = (rel, mime) => {
  const p = path.join(dir, rel);
  if (!fs.existsSync(p)) return null;
  const b64 = fs.readFileSync(p).toString('base64');
  return `data:${mime};base64,${b64}`;
};
const logoDataUri = inlineImg('assets/logo-only.png', 'image/png');
const faviconDataUri = inlineImg('assets/favicon.png', 'image/png');
if (logoDataUri) html = html.split('src="assets/logo-only.png"').join(`src="${logoDataUri}"`);
if (faviconDataUri) html = html.split('href="assets/favicon.png"').join(`href="${faviconDataUri}"`);

const esc = (s) =>
  s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const GH_RELEASE = 'https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases/download/v0.1.0';

const worker = `addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

const RELEASE_BASE = '${GH_RELEASE}';

async function handle(request) {
  const url = new URL(request.url);

  // Stream installers from our release CDN (public repo) through this Worker so the
  // user never sees github.com. Cloudflare caches the response at the edge
  // (max-age=3600), so after the first pull every download is fast and github-free.
  if (url.pathname.startsWith('/download/')) {
    const file = url.pathname.replace('/download/', '');
    const upstream = RELEASE_BASE + '/' + file;
    const r = await fetch(upstream, {
      redirect: 'follow',
      headers: { 'User-Agent': 'DivinityWorks/1.0', 'Accept': '*/*' },
    });
    const headers = new Headers(r.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=3600');
    headers.set('content-disposition', 'attachment; filename=' + file);
    return new Response(r.body, { status: r.status, headers });
  }

  const css = \`${esc(css)}\`;
  let page = \`${esc(html)}\`;
  page = page.split('<link rel="stylesheet" href="styles.css" />').join('<style>' + css + '</style>');
  return new Response(page, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
`;

const outDir = path.join(dir, '..', 'cloudflare');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'worker.js'), worker);
console.log('classic worker.js written, bytes:', worker.length);
console.log('logo inlined:', !!logoDataUri, 'favicon inlined:', !!faviconDataUri);
