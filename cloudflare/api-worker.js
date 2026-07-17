// Reverse proxy for api.divinityworks.space -> Oracle Cloud backend.
//
// Architecture:
//   Browser -> Cloudflare edge -> this worker -> cloudflared on Oracle VM
//     -> Next.js app on 127.0.0.1:3000
//
// The box runs cloudflared with a quick-tunnel (trycloudflare.com URL) that
// changes on every reboot. To make this less fragile, we try multiple
// upstreams in order and use the first that responds. The named-tunnel
// hostname (66d4ade1-...cfargotunnel.com) only resolves when accessed via a
// CNAME record pointing at it; the trycloudflare URL is the actual working
// path until a proper CNAME is added for api.divinityworks.space.
//
// TODO: add a CNAME record `api.divinityworks.space -> 66d4ade1-...cfargotunnel.com`
// in Cloudflare DNS, then delete this worker entirely. The named tunnel's
// ingress config already routes the catch-all to 127.0.0.1:3000.

const UPSTREAMS = [
  'https://mild-teens-context-exhibit.trycloudflare.com',
  // Future: when DNS is properly configured, the worker can be removed.
];

addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, x-client-id, Authorization',
      },
    });
  }

  // Build clean headers. Preserve original Host so the Next.js app sees
  // api.divinityworks.space (its URL generation depends on this).
  const headers = new Headers(request.headers);
  headers.set('Host', url.host);
  // Strip cf-* headers that Cloudflare adds — the upstream will re-add what it needs.
  for (const key of [...headers.keys()]) {
    if (key.toLowerCase().startsWith('cf-')) headers.delete(key);
  }

  const init = {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'follow',
  };

  // Try each upstream in order; return the first successful response.
  for (const upstream of UPSTREAMS) {
    const target = upstream + url.pathname + url.search;
    try {
      const resp = await fetch(target, init);
      // Don't accept 5xx from one upstream — try the next.
      if (resp.status < 500) {
        const newHeaders = new Headers(resp.headers);
        newHeaders.set('access-control-allow-origin', '*');
        newHeaders.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newHeaders.set('access-control-allow-headers', 'Content-Type, x-client-id, Authorization');
        return new Response(resp.body, { status: resp.status, headers: newHeaders });
      }
      console.warn(`[api-worker] ${upstream} returned ${resp.status}, trying next upstream`);
    } catch (err) {
      console.warn(`[api-worker] ${upstream} fetch failed: ${err}`);
    }
  }

  return new Response(
    JSON.stringify({ error: 'Backend unreachable', detail: 'All upstreams failed' }),
    {
      status: 502,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
    }
  );
}
