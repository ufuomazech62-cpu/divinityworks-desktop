const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

const token = jwt.sign(
  { sub: '088c90ff-e4e8-4b99-9bc7-f16616f8927f', email: 'test@divinityworks.space', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + 3600 },
  '0f49bae3bde1473c2a727876c8b56ad07dce6ff86e9398e899f440daf0f48dc1',
  { algorithm: 'HS256' }
);
console.log('Token generated:', token.substring(0, 30) + '...');

const ws = new WebSocket('ws://localhost:8790/ws', ['bearer', token]);
let msgCount = 0;

ws.on('open', () => {
  console.log('WebSocket connected!');
  ws.send(JSON.stringify({ id: 'test-1', channel: 'sessions:list', data: {} }));
  console.log('Sent sessions:list request');
});

ws.on('message', (data) => {
  msgCount++;
  const msg = data.toString();
  console.log('Message ' + msgCount + ':', msg.substring(0, 500));
  if (msgCount >= 2) {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.log('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.log('Timeout - no response received');
  process.exit(1);
}, 10000);
