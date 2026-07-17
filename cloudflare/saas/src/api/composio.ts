/**
 * Composio proxy — forwards requests to the Composio API using the company's
 * API key. Users never see the Composio key; they authenticate to us with
 * their bearer token.
 *
 *   GET  /api/composio/*   -> proxy to Composio API
 *   POST /api/composio/*   -> proxy to Composio API
 *
 * Composio's API is at https://backend.composio.dev/api/v1/*
 * We forward the user's bearer token as `x-api-key` (Composio's auth header)
 * — but since we manage the key centrally, we always use OUR key, not the
 * user's. The user identifies themselves via their Divinity JWT, and we
 * forward their user_id to Composio as a header for tracking.
 */
import { Hono, type Context } from 'hono';
import { requireAuth } from '../lib/auth.js';
import type { Env, AuthVars } from '../lib/env.js';

export const composio = new Hono<{ Bindings: Env; Variables: AuthVars }>();

composio.use('*', requireAuth);

async function proxy(c: Context): Promise<Response> {
  // Strip the /api/composio prefix
  const path = c.req.path.replace('/api/composio', '');
  const url = `${c.env.COMPOSIO_BASE_URL}${path}${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}`;

  const reqHeaders = new Headers(c.req.raw.headers);
  reqHeaders.delete('authorization');
  reqHeaders.delete('host');
  reqHeaders.delete('cookie');
  // Use OUR Composio key, not the user's
  reqHeaders.set('x_api_key', c.env.COMPOSIO_API_KEY);
  // Identify the user to Composio for tracking/audit
  const user = c.get('user')!;
  reqHeaders.set('x-divinity-user-id', user.id);
  reqHeaders.set('x-divinity-user-email', user.email);

  const method = c.req.method;
  let body: ReadableStream<Uint8Array> | null | undefined = undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = c.req.raw.body;
  }

  const upstream = await fetch(url, { method, headers: reqHeaders, body });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.set('access-control-allow-origin', '*');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

// Catch-all — proxy every method and path
composio.all('*', (c) => proxy(c));
