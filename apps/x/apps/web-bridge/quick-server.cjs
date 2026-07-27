const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(process.env.HOME, 'divinityworks-desktop/apps/x/apps/renderer/dist-web');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.map':'application/json'};
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/web.html';
  const fp = path.join(DIST, p);
  if (!fs.existsSync(fp)) {
    // SPA fallback
    const idx = path.join(DIST, 'web.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, {'Content-Type':'text/html'});
      return res.end(fs.readFileSync(idx));
    }
    res.writeHead(404); return res.end('Not found');
  }
  const ext = path.extname(fp);
  res.writeHead(200, {'Content-Type': MIME[ext]||'application/octet-stream'});
  fs.createReadStream(fp).pipe(res);
});
const wss = new (require('ws').WebSocketServer)({ server });
wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      ws.send(JSON.stringify({ type: 'response', reqId: msg.reqId, data: { ok: true, stub: true } }));
    } catch(e) {}
  });
});
server.listen(8790, () => console.log('Server on 8790'));
