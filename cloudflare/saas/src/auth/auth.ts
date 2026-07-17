/**
 * Auth routes — signup, login, refresh, logout.
 *
 * Flow:
 *   POST /auth/signup   { email, password }   -> { access_token, refresh_token, user }
 *   POST /auth/login    { email, password }   -> { access_token, refresh_token, user }
 *   POST /auth/refresh  { refresh_token }     -> { access_token, refresh_token }
 *   POST /auth/logout   { refresh_token }     -> 204  (bearer-authed; revokes all refresh tokens)
 *
 * Access tokens: HS256 JWT, 15-minute expiry, validated statelessly via
 * `verifyJwt`. The desktop app stores this and sends it as `Bearer` on every
 * API call.
 *
 * Refresh tokens: random 32-byte hex, 30-day expiry, stored SHA-256-hashed in
 * D1 so a DB compromise doesn't immediately grant refresh ability. Rotated on
 * each refresh (old token revoked, new one issued).
 */
import { Hono, type Context } from 'hono';
import { hashPassword, verifyPassword, signJwt, generateToken, generateUuid, sha256 } from '../lib/crypto.js';
import { requireAuth } from '../lib/auth.js';
import type { Env, AuthVars } from '../lib/env.js';

const ACCESS_TOKEN_TTL = 15 * 60;           // 15 minutes
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days

export const auth = new Hono<{ Bindings: Env; Variables: AuthVars }>();

// ---------- POST /auth/signup ----------
auth.post('/signup', async (c) => {
  const body = await c.req.json().catch(() => null) as { email?: string; password?: string } | null;
  if (!body?.email || !body?.password) {
    return c.json({ error: 'email and password are required' }, 400);
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email' }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400);
  }

  // Check if user already exists
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ error: 'An account with this email already exists' }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const userId = generateUuid();
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, password_salt) VALUES (?, ?, ?, ?)'
  ).bind(userId, email, hash, salt).run();

  // Auto-create a free subscription
  await c.env.DB.prepare(
    'INSERT INTO subscriptions (user_id, plan_id, status) VALUES (?, ?, ?)'
  ).bind(userId, 'free', 'active').run();

  const tokens = await issueTokens(c, userId, email);
  return c.json({
    user: { id: userId, email },
    ...tokens,
  }, 201);
});

// ---------- POST /auth/login ----------
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null) as { email?: string; password?: string } | null;
  if (!body?.email || !body?.password) {
    return c.json({ error: 'email and password are required' }, 400);
  }
  const email = body.email.trim().toLowerCase();

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!user) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }
  const valid = await verifyPassword(body.password, user.password_hash as string, user.password_salt as string);
  if (!valid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  await c.env.DB.prepare('UPDATE users SET last_login_at = unixepoch() WHERE id = ?').bind(user.id).run();
  const tokens = await issueTokens(c, user.id as string, email);
  return c.json({
    user: { id: user.id, email },
    ...tokens,
  });
});

// ---------- POST /auth/refresh ----------
auth.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => null) as { refresh_token?: string } | null;
  if (!body?.refresh_token) {
    return c.json({ error: 'refresh_token is required' }, 400);
  }
  const tokenHash = await sha256(body.refresh_token);
  const row = await c.env.DB.prepare(
    'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > unixepoch()'
  ).bind(tokenHash).first();
  if (!row) {
    return c.json({ error: 'Invalid or expired refresh token' }, 401);
  }

  // Rotate: revoke the old, issue a new one
  await c.env.DB.prepare('UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE id = ?').bind(row.id).run();

  const user = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(row.user_id).first();
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  const tokens = await issueTokens(c, row.user_id as string, user.email as string);
  return c.json(tokens);
});

// ---------- POST /auth/logout (authed) — revokes all refresh tokens ----------
auth.post('/logout', requireAuth, async (c) => {
  const user = c.get('user')!;
  await c.env.DB.prepare(
    'UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE user_id = ? AND revoked_at IS NULL'
  ).bind(user.id).run();
  return c.json({ ok: true });
});

// ---------- helper: issue access + refresh tokens ----------
async function issueTokens(c: Context, userId: string, email: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const now = Math.floor(Date.now() / 1000);
  const access_token = await signJwt(
    { sub: userId, email, exp: now + ACCESS_TOKEN_TTL, type: 'access' },
    c.env.JWT_SECRET
  );

  const refresh_token = generateToken();
  const refreshHash = await sha256(refresh_token);
  const refreshId = generateUuid();
  await c.env.DB.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(refreshId, userId, refreshHash, now + REFRESH_TOKEN_TTL).run();

  return { access_token, refresh_token, expires_in: ACCESS_TOKEN_TTL };
}
