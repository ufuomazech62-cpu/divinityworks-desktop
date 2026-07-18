/**
 * Divinity Works SaaS — Cloudflare Worker entry point.
 *
 * Routes:
 *   /auth/*            — signup, login, refresh, logout (email/password v1)
 *   /api/me            — current user + subscription + usage
 *   /api/llm/*         — LLM proxy to OpenRouter (hy3)
 *   /api/composio/*    — Composio integration proxy
 *   /api/billing/*     — Stripe billing (v2)
 *   /v1/*              — backwards-compat rewrites for the desktop app
 *                          /v1/me      -> /api/me
 *                          /v1/llm/*   -> /api/llm/*
 *                          /v1/config  -> unauthenticated public config
 *   /                  — dashboard HTML (sign-in, account, billing)
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from './auth/auth.js';
import { api } from './api/me.js';
import { llm } from './api/llm.js';
import { composio } from './api/composio.js';
import { dashboardPage, signinPage, signupPage } from './pages/dashboard.js';
import type { Env, AuthVars } from './lib/env.js';

const app = new Hono<{ Bindings: Env; Variables: AuthVars }>();

app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-client-id'],
  exposeHeaders: ['Content-Length', 'X-Request-Id'],
}));

// ---------- health check ----------
app.get('/health', (c) => c.json({ ok: true, env: c.env.ENV, time: Date.now() }));

// ---------- unauthenticated public config (consumed by the desktop app) ----------
app.get('/v1/config', (c) => c.json({
  appUrl: 'https://dash.divinityworks.space',
  websocketApiUrl: '',
  supabaseUrl: '',  // deprecated field, kept for desktop schema compat
  auth: {
    issuer: 'https://dash.divinityworks.space',
    flows: ['email-password'],  // v2 will add 'google'
  },
  billing: { plans: [] },
  llm: {
    baseUrl: 'https://dash.divinityworks.space/api/llm',
    defaultModel: c.env.LLM_DEFAULT_MODEL,
  },
}));

// ---------- backwards-compat rewrites so the existing desktop app works
// without code changes. Desktop calls /v1/me and /v1/llm/* — we route them
// to the new /api/* handlers.
app.get('/v1/me', async (c) => {
  // Re-dispatch through the main app's /api/me route
  const newUrl = new URL(c.req.url);
  newUrl.pathname = '/api/me';
  const newReq = new Request(newUrl, c.req.raw);
  return app.fetch(newReq, c.env, c.executionCtx);
});
app.all('/v1/llm/*', async (c) => {
  const newUrl = new URL(c.req.url);
  newUrl.pathname = c.req.path.replace('/v1/llm', '/api/llm');
  const newReq = new Request(newUrl, c.req.raw);
  return app.fetch(newReq, c.env, c.executionCtx);
});
// /v1/composio/* -> /api/composio/* (desktop app calls /v1/composio/* when signed in)
app.all('/v1/composio/*', async (c) => {
  const newUrl = new URL(c.req.url);
  newUrl.pathname = c.req.path.replace('/v1/composio', '/api/composio');
  const newReq = new Request(newUrl, c.req.raw);
  return app.fetch(newReq, c.env, c.executionCtx);
});

// ---------- auth routes ----------
app.route('/auth', auth);

// ---------- API routes (require Bearer token) ----------
app.route('/api', api);
app.route('/api/llm', llm);
app.route('/api/composio', composio);

// ---------- dashboard pages (HTML) ----------
app.get('/', (c) => c.html(dashboardPage()));
app.get('/signin', (c) => c.html(signinPage()));
app.get('/signup', (c) => c.html(signupPage()));

// ---------- 404 ----------
app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal server error', message: err.message }, 500);
});

export default app;
