/**
 * Google OAuth routes — the ONLY sign-in method (no email/password).
 *
 * Flow:
 *   1. User clicks "Sign in with Google" on /signin
 *   2. Worker redirects to Google's consent screen
 *   3. User authenticates at Google
 *   4. Google redirects back to /auth/google/callback?code=...&state=...
 *   5. Worker exchanges code for Google tokens (server-side, with client_secret)
 *   6. Worker fetches user's email + Google sub from userinfo endpoint
 *   7. Worker creates/finds user in D1 (keyed on Google sub)
 *   8. Worker issues our JWT (access + refresh)
 *   9. If the original request came from the desktop app (?desktop=1):
 *      redirect to divinity://auth/callback?access_token=...&refresh_token=...
 *      (the OS hands this URL to the desktop app)
 *   10. Otherwise: set a cookie and redirect to the dashboard
 *
 * The `state` parameter carries { desktop: boolean, nonce: string } so we
 * know whether to deep-link back to the app after the OAuth dance.
 */
import { Hono } from 'hono';
import { signJwt, generateToken, generateUuid, sha256 } from '../lib/crypto.js';
import type { Env, AuthVars } from '../lib/env.js';

const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60;
const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const googleAuth = new Hono<{ Bindings: Env; Variables: AuthVars }>();

// ---------- GET /auth/google — start the OAuth flow ----------
googleAuth.get('/google', async (c) => {
  const isDesktop = c.req.query('desktop') === '1';
  const nonce = generateUuid();

  // Store state in KV so we can verify it on callback (CSRF protection).
  // Key: oauth_state:<nonce>, Value: { desktop: bool }, TTL: 10 min.
  await c.env.KV.put(`oauth_state:${nonce}`, JSON.stringify({ desktop: isDesktop }), { expirationTtl: 600 });

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${new URL(c.req.url).origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state: nonce,
    access_type: 'online', // no refresh token from Google — we issue our own
    prompt: 'consent', // always show consent so users can pick their account
  });

  return c.redirect(`${GOOGLE_OAUTH_BASE}?${params.toString()}`);
});

// ---------- GET /auth/google/callback — Google redirects back here ----------
googleAuth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  // Handle user rejecting consent
  if (error) {
    return c.html(renderError('Sign-in was cancelled. You can close this tab and try again.'));
  }
  if (!code || !state) {
    return c.html(renderError('Missing authorization code or state. Please try signing in again.'));
  }

  // Verify state (CSRF protection)
  const stateData = await c.env.KV.get(`oauth_state:${state}`);
  if (!stateData) {
    return c.html(renderError('Invalid or expired session. Please try signing in again.'));
  }
  await c.env.KV.delete(`oauth_state:${state}`);
  const { desktop: isDesktop } = JSON.parse(stateData) as { desktop: boolean };

  // Exchange code for Google tokens
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${new URL(c.req.url).origin}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error('[google-oauth] Token exchange failed:', tokenRes.status, errBody);
    return c.html(renderError('Google authentication failed. Please try again.'));
  }

  const tokenBody = await tokenRes.json() as { access_token: string; id_token?: string };

  // Fetch user info from Google
  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });

  if (!userInfoRes.ok) {
    console.error('[google-oauth] Userinfo fetch failed:', userInfoRes.status);
    return c.html(renderError('Failed to get your Google profile. Please try again.'));
  }

  const userInfo = await userInfoRes.json() as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!userInfo.email) {
    return c.html(renderError('Your Google account has no email. Please use a Google account with an email.'));
  }

  // Find or create user in D1 (keyed on Google sub)
  const googleSub = `google:${userInfo.sub}`;
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE password_hash = ?')
    .bind(googleSub) // reuse password_hash column as the "provider:sub" identifier for Google users
    .first();

  if (!user) {
    // Create new user. password_hash stores "google:<sub>" as the identifier;
    // password_salt is empty (no password — Google-only auth).
    const userId = generateUuid();
    await c.env.DB.prepare(
      'INSERT INTO users (id, email, password_hash, password_salt, name) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, userInfo.email, googleSub, '', userInfo.name || null).run();

    // Auto-create a free subscription
    await c.env.DB.prepare(
      'INSERT INTO subscriptions (user_id, plan_id, status) VALUES (?, ?, ?)'
    ).bind(userId, 'free', 'active').run();

    user = { id: userId, email: userInfo.email, name: userInfo.name || null };
    console.log(`[google-oauth] Created new user ${userId} for ${userInfo.email}`);
  } else {
    // Update email if it changed at Google
    if (user.email !== userInfo.email) {
      await c.env.DB.prepare('UPDATE users SET email = ?, updated_at = unixepoch() WHERE id = ?')
        .bind(userInfo.email, user.id).run();
    }
    await c.env.DB.prepare('UPDATE users SET last_login_at = unixepoch() WHERE id = ?')
      .bind(user.id).run();
  }

  // Issue our JWT + refresh token
  const now = Math.floor(Date.now() / 1000);
  const access_token = await signJwt(
    { sub: user.id as string, email: userInfo.email, exp: now + ACCESS_TOKEN_TTL, type: 'access' },
    c.env.JWT_SECRET
  );

  const refresh_token = generateToken();
  const refreshHash = await sha256(refresh_token);
  const refreshId = generateUuid();
  await c.env.DB.prepare(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(refreshId, user.id as string, refreshHash, now + REFRESH_TOKEN_TTL).run();

  // If the request came from the desktop app, redirect to divinity://
  if (isDesktop) {
    const params = new URLSearchParams({
      access_token,
      refresh_token,
      email: userInfo.email,
    });
    const deepLink = `divinity://auth/callback?${params.toString()}`;
    return c.html(renderDesktopRedirect(deepLink, userInfo.email));
  }

  // Otherwise, redirect to the cloud app (web browser flow)
  // Store tokens in the URL; the /app page picks them up and starts the agent container
  return c.redirect(`/app?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token)}`, 302);
});

// ---------- HTML renderers ----------

function renderDesktopRedirect(deepLink: string, email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Opening Divinity…</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Geist", -apple-system, sans-serif;
      background: #fff; color: #0a0a0a;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px; letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
    }
    .card { max-width: 420px; width: 100%; text-align: center; }
    .mark {
      width: 64px; height: 64px;
      background: #0a0a0a;
      border-radius: 14px;
      border: 3px solid #fff;
      box-shadow: 0 0 0 1px #d4d4d8;
      margin: 0 auto 24px;
      display: flex; align-items: center; justify-content: center;
    }
    .mark svg { width: 36px; height: 36px; }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
    p { color: #525258; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    .email { font-weight: 500; color: #0a0a0a; }
    .btn {
      display: inline-block; padding: 11px 22px;
      background: #0a0a0a; color: #fff; border: none; border-radius: 8px;
      font-family: inherit; font-size: 14px; font-weight: 500;
      text-decoration: none; cursor: pointer;
    }
    .btn:hover { opacity: 0.88; }
    .fallback { margin-top: 32px; font-size: 13px; color: #71717a; }
    .fallback a { color: #0a0a0a; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">
      <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <path fill="#fff" d="M 200 200 L 200 824 Q 200 900 276 900 L 500 900 Q 700 900 820 780 Q 940 660 940 500 Q 940 340 820 220 Q 700 100 500 100 L 276 100 Q 200 100 200 176 Z M 350 250 L 500 250 Q 640 250 720 340 Q 800 430 800 500 Q 800 570 720 660 Q 640 750 500 750 L 350 750 Z"/>
      </svg>
    </div>
    <h1>You're signed in</h1>
    <p>Signed in as <span class="email">${email}</span><br/>Taking you back to Divinity…</p>
    <a href="${deepLink}" class="btn">Open Divinity</a>
    <p class="fallback">If Divinity doesn't open, <a href="${deepLink}">click here</a>.</p>
  </div>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`;
}

function renderError(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign-in error</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    body { font-family: "Geist", sans-serif; background: #fff; color: #0a0a0a; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { max-width: 400px; text-align: center; padding: 32px; }
    h1 { font-size: 20px; margin-bottom: 12px; }
    p { color: #525258; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    a { color: #0a0a0a; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign-in failed</h1>
    <p>${message}</p>
    <a href="/signin">Try again</a>
  </div>
</body>
</html>`;
}
