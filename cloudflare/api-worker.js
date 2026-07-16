addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);
  const origin = 'https://mild-teens-context-exhibit.trycloudflare.com';
  const target = origin + url.pathname + url.search;
  const init = {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow',
  };
  const resp = await fetch(target, init);
  const newHeaders = new Headers(resp.headers);
  newHeaders.set('access-control-allow-origin', '*');
  return new Response(resp.body, { status: resp.status, headers: newHeaders });
}
