// Reverse proxy for api.divinityworks.space -> Oracle Cloud backend via the
// persistent Cloudflare named tunnel `divinityworks`.
//
// Architecture:
//   Browser -> Cloudflare edge -> this worker -> named tunnel (66d4ade1-...)
//     -> cloudflared on the Oracle VM -> Next.js app on 127.0.0.1:3000
//
// The tunnel's ingress config has a catch-all rule that routes any Host
// header to 127.0.0.1:3000, so we preserve the original Host header to keep
// the backend's URL generation correct.
//
// Replacing the previous trycloudflare.com quick-tunnel URL with the named
// tunnel hostname so the proxy doesn't break every time the box reboots.

const TUNNEL_HOSTNAME = '66d4ade1-b083-4b1e-82f1-9a078958a5b9.cfargotunnel.com';

addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const target = `https://${TUNNEL_HOSTNAME}${url.pathname}${url.search}`;

  // Build a clean set of headers. Preserve the original Host so the tunnel's
  // ingress rules and the Next.js app both see api.divinityworks.space.
  const headers = new Headers(request.headers);
  headers.set('Host', url.host);
  // Strip cf-* headers that Cloudflare adds — the tunnel will re-add what it needs.
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('cf-')) headers.delete(key);
  }

  const init = {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow',
  };

  let resp;
  try {
    resp = await fetch(target, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Backend unreachable', detail: String(err) }),
      { status: 502, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }
    );
  }

  const newHeaders = new Headers(resp.headers);
  newHeaders.set('access-control-allow-origin', '*');
  newHeaders.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('access-control-allow-headers', 'Content-Type, x-client-id, Authorization');

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: newHeaders });
  }

  return new Response(resp.body, { status: resp.status, headers: newHeaders });
}
