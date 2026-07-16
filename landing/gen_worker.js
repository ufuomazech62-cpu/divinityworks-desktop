const fs = require('fs');
const path = require('path');

const dir = __dirname;
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
let css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');

const esc = (s) =>
  s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const worker = `export default {
  async fetch(request, env) {
    const css = \`${esc(css)}\`;
    let page = \`${esc(html)}\`;
    page = page.split('<link rel="stylesheet" href="styles.css" />').join('<style>' + css + '</style>');
    return new Response(page, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    });
  },
};
`;

const outDir = path.join(dir, '..', 'cloudflare');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'worker.js'), worker);
console.log('worker.js written, bytes:', worker.length);
