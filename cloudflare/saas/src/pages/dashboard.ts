/**
 * HTML pages for the dashboard. Google-only sign-in — no email/password.
 * The logo is an inline SVG (the black "D" mark with white border) so it
 * loads instantly with no external requests.
 */

const LOGO_SVG = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" rx="224" fill="#0a0a0a" stroke="#fff" stroke-width="24"/>
  <path fill="#fff" d="M 200 200 L 200 824 Q 200 900 276 900 L 500 900 Q 700 900 820 780 Q 940 660 940 500 Q 940 340 820 220 Q 700 100 500 100 L 276 100 Q 200 100 200 176 Z M 350 250 L 500 250 Q 640 250 720 340 Q 800 430 800 500 Q 800 570 720 660 Q 640 750 500 750 L 350 750 Z"/>
</svg>`;

const GOOGLE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>`;

const SHELL = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024'><rect width='1024' height='1024' rx='224' fill='%230a0a0a'/><path fill='%23fff' d='M 200 200 L 200 824 Q 200 900 276 900 L 500 900 Q 700 900 820 780 Q 940 660 940 500 Q 940 340 820 220 Q 700 100 500 100 L 276 100 Q 200 100 200 176 Z M 350 250 L 500 250 Q 640 250 720 340 Q 800 430 800 500 Q 800 570 720 660 Q 640 750 500 750 L 350 750 Z'/></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff; color: #0a0a0a;
      line-height: 1.5; letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
      display: flex; flex-direction: column; min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }
    .nav {
      border-bottom: 1px solid #ececef; padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .brand { font-weight: 600; font-size: 16px; letter-spacing: -0.02em; display: inline-flex; align-items: center; gap: 10px; }
    .brand__mark { width: 28px; height: 28px; }
    .brand__sub { color: #525258; font-weight: 500; }
    .nav__links { display: flex; gap: 24px; font-size: 14px; color: #525258; }
    .nav__links a:hover { color: #0a0a0a; }
    .main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 64px 24px; }
    .card { width: 100%; max-width: 400px; text-align: center; }
    .logo { width: 72px; height: 72px; margin: 0 auto 24px; }
    .logo svg { width: 100%; height: 100%; }
    .card h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.035em; margin-bottom: 8px; }
    .card p { color: #525258; font-size: 15px; margin-bottom: 32px; }
    .google-btn {
      display: inline-flex; align-items: center; gap: 12px;
      padding: 12px 24px; font-size: 15px; font-weight: 500;
      background: #fff; color: #0a0a0a;
      border: 1px solid #d4d4d8; border-radius: 10px;
      font-family: inherit; letter-spacing: inherit; cursor: pointer;
      transition: border-color .15s, box-shadow .15s;
      text-decoration: none;
    }
    .google-btn:hover { border-color: #0a0a0a; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .footer { border-top: 1px solid #ececef; padding: 24px; text-align: center; font-size: 13px; color: #71717a; }
  </style>
</head>
<body>
  <header class="nav">
    <a class="brand" href="/">
      <span class="brand__mark">${LOGO_SVG}</span>
      <span>Divinity<span class="brand__sub">Works</span></span>
    </a>
    <nav class="nav__links">
      <a href="https://divinityworks.space">Home</a>
      <a href="/signin">Sign in</a>
    </nav>
  </header>
  <main class="main">${body}</main>
  <footer class="footer">© ${new Date().getFullYear()} Divinity Works</footer>
</body>
</html>`;

export function signinPage(): string {
  return SHELL('Sign in', `
    <div class="card">
      <div class="logo">${LOGO_SVG}</div>
      <h1>Sign in to Divinity</h1>
      <p>Use your Google account to continue.</p>
      <a id="google-btn" href="/auth/google" class="google-btn">
        ${GOOGLE_ICON}
        Sign in with Google
      </a>
    </div>
    <script>
      // Pass ?desktop=1 through to the Google OAuth flow so the Worker knows
      // to redirect back to divinity:// after authentication.
      var isDesktop = new URLSearchParams(window.location.search).has('desktop');
      if (isDesktop) {
        document.getElementById('google-btn').href = '/auth/google?desktop=1';
      }
    </script>
  `);
}

export function signupPage(): string {
  // Google-only — signup and signin are the same page
  return signinPage();
}

export function dashboardPage(): string {
  return SHELL('Dashboard', `
    <div class="card">
      <div class="logo">${LOGO_SVG}</div>
      <h1>Divinity Works</h1>
      <p>The desktop app is where the work happens. This dashboard is for managing your account.</p>
      <div id="content" style="margin-top: 32px;">
        <p style="font-size:14px;color:#525258">Loading…</p>
      </div>
    </div>
    <script>
      // Check for tokens in URL (from Google OAuth redirect)
      const params = new URLSearchParams(window.location.search);
      let token = params.get('access_token') || localStorage.getItem('dw_access_token');

      if (token) {
        localStorage.setItem('dw_access_token', token);
        const refreshToken = params.get('refresh_token');
        if (refreshToken) localStorage.setItem('dw_refresh_token', refreshToken);
        // Clean the URL
        window.history.replaceState({}, '', '/');
      }

      const content = document.getElementById('content');
      if (!token) {
        content.innerHTML = '<p style="font-size:15px;margin-bottom:24px">You are not signed in.</p><a href="/signin" class="google-btn">${GOOGLE_ICON} Sign in with Google</a>';
      } else {
        fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(res => res.ok ? res.json() : Promise.reject(new Error('Not authenticated')))
          .then(data => {
            content.innerHTML = '
              <div style="text-align:left;margin-bottom:24px;">
                <div style="font-size:13px;color:#525258;margin-bottom:4px">Signed in as</div>
                <div style="font-size:16px;font-weight:500">' + data.user.email + '</div>
              </div>
              <div style="text-align:left;margin-bottom:24px;">
                <div style="font-size:13px;color:#525258;margin-bottom:4px">Plan</div>
                <div style="font-size:16px;font-weight:500">' + data.subscription.planId + ' (' + data.subscription.status + ')</div>
              </div>
              <button id="logout" style="padding:10px 20px;font-size:14px;font-weight:500;background:#fff;color:#0a0a0a;border:1px solid #d4d4d8;border-radius:8px;cursor:pointer;font-family:inherit;">Sign out</button>
            ';
            document.getElementById('logout').addEventListener('click', async () => {
              await fetch('/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
              localStorage.removeItem('dw_access_token');
              localStorage.removeItem('dw_refresh_token');
              window.location.href = '/signin';
            });
          })
          .catch(() => {
            localStorage.removeItem('dw_access_token');
            localStorage.removeItem('dw_refresh_token');
            content.innerHTML = '<p style="font-size:15px;margin-bottom:24px">Your session has expired.</p><a href="/signin" class="google-btn">${GOOGLE_ICON} Sign in again</a>';
          });
      }
    </script>
  `);
}
