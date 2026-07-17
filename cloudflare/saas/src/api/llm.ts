/**
 * LLM proxy — forwards chat completion requests to OpenRouter using the
 * company's API key. Users never see the OpenRouter key; they authenticate
 * to us with their bearer token and we forward.
 *
 *   GET  /api/llm/models          -> proxy to OpenRouter /models
 *   POST /api/llm/chat/completions -> proxy to OpenRouter /chat/completions
 *   POST /api/llm/completions      -> proxy to OpenRouter /completions
 *   POST /api/llm/embeddings       -> proxy to OpenRouter /embeddings
 *
 * The desktop app's `gateway.ts` uses baseURL = `${API_URL}/v1/llm` and
 * sends OpenAI-compatible requests. We map /v1/llm/* -> /api/llm/* at the
 * worker level (see index.ts).
 *
 * Default model is `tencent/hy3:free` (set in wrangler.toml) but the
 * request body can override per-call.
 */
import { Hono, type Context } from 'hono';
import { requireAuth } from '../lib/auth.js';
import type { Env, AuthVars } from '../lib/env.js';

export const llm = new Hono<{ Bindings: Env; Variables: AuthVars }>();

// All routes require auth
llm.use('*', requireAuth);

// Generic proxy helper
async function proxy(c: Context, path: string): Promise<Response> {
  const url = `${c.env.LLM_BASE_URL}${path}`;
  const reqHeaders = new Headers(c.req.raw.headers);
  // Strip our headers, add OpenRouter auth
  reqHeaders.delete('authorization');
  reqHeaders.delete('host');
  reqHeaders.set('Authorization', `Bearer ${c.env.OPENROUTER_API_KEY}`);
  reqHeaders.set('HTTP-Referer', 'https://divinityworks.space');
  reqHeaders.set('X-Title', 'Divinity Works');

  // Read the body for POST/PUT, pass through for GET
  const method = c.req.method;
  let body: ReadableStream<Uint8Array> | null | undefined = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = c.req.raw.body;
  }

  const upstream = await fetch(url, {
    method,
    headers: reqHeaders,
    body,
  });

  // Forward the response, preserving status + headers + streaming body
  const respHeaders = new Headers(upstream.headers);
  respHeaders.set('access-control-allow-origin', '*');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

llm.get('/models', (c) => proxy(c, '/models'));
llm.post('/chat/completions', (c) => proxy(c, '/chat/completions'));
llm.post('/completions', (c) => proxy(c, '/completions'));
llm.post('/embeddings', (c) => proxy(c, '/embeddings'));

// Catch-all for any other OpenRouter endpoint
llm.all('*', (c) => {
  const path = c.req.path.replace('/api/llm', '');
  return proxy(c, path);
});
