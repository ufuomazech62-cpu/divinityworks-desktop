/**
 * Desktop app callback — the bridge between the browser sign-in flow and the
 * desktop app.
 *
 * Flow:
 *   1. User opens dash.divinityworks.space/signin in their browser
 *   2. Signs in → Worker issues access_token + refresh_token
 *   3. Browser JS redirects to:
 *        divinity://auth/callback?access_token=XXX&refresh_token=YYY&email=ZZZ
 *   4. OS hands the divinity:// URL to the desktop app (Electron)
 *   5. Desktop app extracts the tokens, stores them, updates UI
 *
 * This file renders the intermediate HTML page that does the redirect.
 * It's intentionally minimal — just a "Sending you back to Divinity…"
 * message with a meta-refresh + JS redirect to the divinity:// URL.
 *
 * The tokens are passed as URL params. They're short-lived (access=15min,
 * refresh=30day) and the URL is only seen by the user's own browser + the
 * desktop app. This is the same pattern Slack/Linear/Notion use.
 */

import type { Context } from 'hono';

export function desktopCallbackPage(c: Context, accessToken: string, refreshToken: string, email: string): string {
  // Build the divinity:// callback URL
  const params = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    email,
  });
  const deepLink = `divinity://auth/callback?${params.toString()}`;

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
      font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff; color: #0a0a0a;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
      letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
    }
    .card {
      max-width: 420px; width: 100%;
      text-align: center;
    }
    .mark {
      width: 56px; height: 56px;
      background: #0a0a0a; border-radius: 12px;
      margin: 0 auto 24px;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
      font-size: 28px; font-weight: 700;
    }
    h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.025em; margin-bottom: 8px; }
    p { color: #525258; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    .btn {
      display: inline-block; padding: 11px 22px;
      background: #0a0a0a; color: #fff; border: none; border-radius: 8px;
      font-family: inherit; font-size: 14px; font-weight: 500;
      text-decoration: none; cursor: pointer;
      letter-spacing: -0.01em;
    }
    .btn:hover { opacity: 0.88; }
    .fallback { margin-top: 32px; font-size: 13px; color: #71717a; }
    .fallback a { color: #0a0a0a; text-decoration: underline; text-underline-offset: 3px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="mark">D</div>
    <h1>Opening Divinity…</h1>
    <p>You're signed in. Taking you back to the app.</p>
    <a href="${deepLink}" class="btn" id="open-btn">Open Divinity</a>
    <p class="fallback">
      If Divinity doesn't open automatically,
      <a href="${deepLink}">click here</a>.
    </p>
  </div>
  <script>
    // Try to open the divinity:// URL automatically. Most browsers show a
    // confirmation prompt the first time; after that it just opens.
    window.location.href = ${JSON.stringify(deepLink)};
  </script>
</body>
</html>`;
}
