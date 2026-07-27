import WebSocket from 'ws';
import crypto from 'crypto';

function createJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const data = enc(header) + '.' + enc(payload);
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return data + '.' + sig;
}

const JWT_SECRET = '0f49bae3bde1473c2a727876c8b56ad07dce6ff86e9398e899f440daf0f48dc1';
const USER_ID = '088c90ff-e4e8-4b99-9bc7-f16616f8927f';
const token = createJwt(
  { sub: USER_ID, email: 'zechy@divinityworks.space', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 3600 },
  JWT_SECRET
);

console.log('Connecting to ws://localhost:8790...');
const ws = new WebSocket('ws://localhost:8790/ws', ['bearer', token]);

ws.on('open', () => {
  console.log('Connected! Testing workspace:getRoot...');
  ws.send(JSON.stringify({
    type: 'invoke',
    channel: 'workspace:getRoot',
    reqId: 'test-root',
    args: null
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Response:', JSON.stringify(msg, null, 2));
  ws.close();
});

ws.on('error', (err) => {
  console.error('WS error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 10000);
