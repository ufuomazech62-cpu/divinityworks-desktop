/**
 * Deepgram STT (speech-to-text) WebSocket proxy.
 *
 * The desktop app opens:
 *   wss://dash.divinityworks.space/deepgram/v1/listen?model=nova-3&...
 *
 * This Worker upgrades the connection to WebSocket, opens a parallel
 * WebSocket to wss://api.deepgram.com/v1/listen with the same query params
 * + the company API key, and pipes data bidirectionally.
 *
 * Cloudflare Workers WebSocket API:
 * - Incoming: new WebSocketPair() → [client, server], server.accept(), return Response with webSocket: client
 * - Outgoing: fetch(url, { headers: { Upgrade: 'websocket' } }) → response.webSocket
 */

import type { Env } from '../lib/env.js';

const DEEPGRAM_STT_BASE = 'https://api.deepgram.com/v1/listen';

export async function handleDeepgramWebSocket(request: Request, env: Env): Promise<Response> {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // Parse the incoming URL to forward query params to Deepgram
  const url = new URL(request.url);
  const dgPath = url.pathname.replace(/^\/deepgram/, '') + url.search;

  // Create the client ↔ Worker WebSocket pair
  const pair = new WebSocketPair();
  const clientWs = pair[0];
  const serverWs = pair[1];

  // Connect to Deepgram's WebSocket API via fetch with Upgrade header
  const dgResponse = await fetch(`${DEEPGRAM_STT_BASE}${dgPath}`, {
    headers: {
      'Upgrade': 'websocket',
      'Authorization': `Token ${env.DEEPGRAM_API_KEY}`,
    },
  });

  if (!dgResponse.webSocket) {
    return new Response('Failed to connect to Deepgram', { status: 502 });
  }

  const dgWs = dgResponse.webSocket;
  dgWs.accept();

  let dgReady = false;
  const pendingMessages: ArrayBuffer[] = [];

  // Deepgram → desktop: forward transcript results
  dgWs.addEventListener('message', (event: MessageEvent) => {
    if (serverWs.readyState === 1) { // OPEN
      serverWs.send(event.data);
    }
  });

  dgWs.addEventListener('open', () => {
    dgReady = true;
    for (const msg of pendingMessages) {
      dgWs.send(msg);
    }
    pendingMessages.length = 0;
  });

  dgWs.addEventListener('error', (event: Event) => {
    console.error('[deepgram-ws] Upstream error');
    try { serverWs.close(1011, 'Deepgram connection error'); } catch {}
  });

  dgWs.addEventListener('close', () => {
    try { serverWs.close(1000, 'Deepgram closed'); } catch {}
  });

  // Desktop → Deepgram: forward mic audio
  serverWs.addEventListener('message', (event: MessageEvent) => {
    if (dgReady && dgWs.readyState === 1) {
      dgWs.send(event.data);
    } else if (!dgReady) {
      if (event.data instanceof ArrayBuffer) {
        pendingMessages.push(event.data);
      }
    }
  });

  serverWs.addEventListener('close', () => {
    try { dgWs.close(); } catch {}
  });

  serverWs.addEventListener('error', () => {
    try { dgWs.close(); } catch {}
  });

  // Accept the client-side WebSocket
  serverWs.accept();

  return new Response(null, {
    status: 101,
    webSocket: clientWs,
  });
}
