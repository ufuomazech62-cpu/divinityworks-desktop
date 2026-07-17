import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

/**
 * Validates an Auth0-issued access token sent as a Bearer token in the
 * Authorization header. Used by the Divinity desktop app, which authenticates
 * via Auth0 PKCE (public client) and sends the access token on every API call.
 *
 * The web dashboard continues to use the cookie session flow handled by
 * @auth0/nextjs-auth0; this module is the equivalent path for Bearer tokens.
 */

const AUTH0_DOMAIN = process.env.AUTH0_ISSUER_BASE_URL || 'https://dev-6y2css63pk2d2pwd.us.auth0.com';
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE || undefined;
const ISSUER = AUTH0_DOMAIN.endsWith('/') ? AUTH0_DOMAIN : `${AUTH0_DOMAIN}/`;

// JWKS cache — jose handles caching and refetch internally.
const JWKS = createRemoteJWKSet(new URL(`${AUTH0_DOMAIN}/.well-known/jwks.json`));

export interface AuthenticatedUser {
  /** Auth0 `sub` claim (e.g. `auth0|abc123`). */
  sub: string;
  /** Email from the `email` claim, if present. */
  email?: string;
  /** Raw payload for callers that need other claims. */
  claims: JWTPayload;
}

/**
 * Validates a Bearer token and returns the authenticated user info.
 * Throws if the token is missing, malformed, expired, or fails verification.
 */
export async function validateBearerToken(authHeader: string | null | undefined): Promise<AuthenticatedUser> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Empty bearer token');
  }

  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    issuer: ISSUER,
    algorithms: ['RS256'],
  };
  // Only enforce audience if AUTH0_AUDIENCE is set. Auth0 access tokens issued
  // to the public desktop client may not have an `aud` claim if no API was
  // configured — be permissive in that case so sign-in works end-to-end.
  if (AUTH0_AUDIENCE) {
    verifyOptions.audience = AUTH0_AUDIENCE;
  }

  const { payload } = await jwtVerify(token, JWKS, verifyOptions);
  if (!payload.sub) {
    throw new Error('Token has no sub claim');
  }
  return {
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    claims: payload,
  };
}

/**
 * Extracts the Bearer token from a Request's Authorization header, validates
 * it, and returns the user. Returns null if no Authorization header is present
 * (so callers can fall back to cookie-session auth).
 */
export async function getUserFromBearer(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  try {
    return await validateBearerToken(authHeader);
  } catch (err) {
    // Log and rethrow — caller decides whether to 401 or fall back.
    console.error('[bearer-auth] Token validation failed:', err instanceof Error ? err.message : err);
    throw err;
  }
}
