/**
 * Auth middleware — extracts and validates the JWT from the Authorization
 * header, then attaches the user to the Hono context.
 */
import { Context, Next } from 'hono';
import { verifyJwt, JwtClaims } from './crypto.js';
import type { Env, UserRow } from './env.js';

export interface AuthVars {
  user: UserRow | null;
  jwt: JwtClaims | null;
}

/**
 * requireAuth — middleware that rejects requests without a valid Bearer token.
 * On success, sets `c.get('user')` to the user row from D1.
 */
export async function requireAuth(c: Context<{ Bindings: Env; Variables: AuthVars }>, next: Next) {
  const authHeader = c.req.header('authorization') || c.req.header('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return c.json({ error: 'Missing or malformed Authorization header' }, 401);
  }
  const token = authHeader.slice(7).trim();
  const claims = await verifyJwt(token, c.env.JWT_SECRET);
  if (!claims || claims.type !== 'access') {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
    .bind(claims.sub)
    .first<UserRow>();
  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  c.set('user', user);
  c.set('jwt', claims);
  await next();
}

/**
 * optionalAuth — like requireAuth but doesn't reject on missing/invalid token.
 * Useful for endpoints that behave differently for authed vs anonymous users.
 */
export async function optionalAuth(c: Context<{ Bindings: Env; Variables: AuthVars }>, next: Next) {
  const authHeader = c.req.header('authorization') || c.req.header('Authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    const claims = await verifyJwt(token, c.env.JWT_SECRET);
    if (claims && claims.type === 'access') {
      const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(claims.sub)
        .first<UserRow>();
      if (user) {
        c.set('user', user);
        c.set('jwt', claims);
      }
    }
  }
  await next();
}
