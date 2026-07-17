/**
 * HTML pages for the dashboard. Minimal — server-rendered, no client framework.
 * Just enough to sign in, sign up, and see your account. The desktop app
 * doesn't use these pages; they're for users who want a web view of their
 * account.
 *
 * v1: static HTML with the brand styling (Geist font, black/white, hairline
 * borders) matching the landing page. v2 will add interactivity.
 */

const SHELL = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Divinity Works</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' fill='%230a0a0a'/></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff; color: #0a0a0a;
      line-height: 1.5;
      letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
      display: flex; flex-direction: column; min-height: 100vh;
    }
    a { color: inherit; text-decoration: none; }
    .nav {
      border-bottom: 1px solid #ececef;
      padding: 14px 24px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .brand { font-weight: 600; font-size: 16px; letter-spacing: -0.02em; display: inline-flex; align-items: center; gap: 8px; }
    .brand__mark { width: 24px; height: 24px; background: #0a0a0a; border-radius: 6px; }
    .nav__links { display: flex; gap: 24px; font-size: 14px; color: #525258; }
    .nav__links a:hover { color: #0a0a0a; }
    .main {
      flex: 1; display: flex; align-items: center; justify-content: center;
      padding: 64px 24px;
    }
    .card {
      width: 100%; max-width: 400px;
      border: 1px solid #ececef; border-radius: 12px;
      padding: 32px;
    }
    .card h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.035em; margin-bottom: 8px; }
    .card p { color: #525258; font-size: 14px; margin-bottom: 24px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #525258; }
    .field input {
      width: 100%; padding: 10px 12px; font-size: 14px;
      border: 1px solid #d4d4d8; border-radius: 8px;
      font-family: inherit; letter-spacing: inherit;
      background: #fff; color: #0a0a0a;
    }
    .field input:focus { outline: none; border-color: #0a0a0a; }
    .btn {
      width: 100%; padding: 11px 16px; font-size: 14px; font-weight: 500;
      background: #0a0a0a; color: #fff; border: none; border-radius: 8px;
      font-family: inherit; letter-spacing: inherit; cursor: pointer;
    }
    .btn:hover { opacity: 0.88; }
    .btn--ghost { background: #fff; color: #0a0a0a; border: 1px solid #d4d4d8; }
    .alt { text-align: center; margin-top: 16px; font-size: 13px; color: #525258; }
    .alt a { color: #0a0a0a; text-decoration: underline; text-underline-offset: 3px; }
    .footer {
      border-top: 1px solid #ececef;
      padding: 24px;
      text-align: center; font-size: 13px; color: #71717a;
    }
    .alert {
      padding: 10px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px;
      background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;
    }
  </style>
</head>
<body>
  <header class="nav">
    <a class="brand" href="/">
      <span class="brand__mark"></span>
      <span>Divinity<span style="color:#525258;font-weight:500">Works</span></span>
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
      <h1>Sign in</h1>
      <p>Sign in to your Divinity Works account.</p>
      <form id="form">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required autocomplete="current-password" />
        </div>
        <div id="error" class="alert" style="display:none"></div>
        <button type="submit" class="btn">Sign in</button>
      </form>
      <p class="alt">Don't have an account? <a href="/signup">Sign up</a></p>
    </div>
    <script>
      const form = document.getElementById('form');
      const errEl = document.getElementById('error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.style.display = 'none';
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
          const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Login failed');
          // Store the access token and redirect to dashboard
          localStorage.setItem('dw_access_token', data.access_token);
          localStorage.setItem('dw_refresh_token', data.refresh_token);
          window.location.href = '/';
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
        }
      });
    </script>
  `);
}

export function signupPage(): string {
  return SHELL('Sign up', `
    <div class="card">
      <h1>Create your account</h1>
      <p>Start using Divinity Works.</p>
      <form id="form">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required autocomplete="new-password" minlength="8" />
        </div>
        <div id="error" class="alert" style="display:none"></div>
        <button type="submit" class="btn">Create account</button>
      </form>
      <p class="alt">Already have an account? <a href="/signin">Sign in</a></p>
    </div>
    <script>
      const form = document.getElementById('form');
      const errEl = document.getElementById('error');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errEl.style.display = 'none';
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
          const res = await fetch('/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Sign up failed');
          localStorage.setItem('dw_access_token', data.access_token);
          localStorage.setItem('dw_refresh_token', data.refresh_token);
          window.location.href = '/';
        } catch (err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
        }
      });
    </script>
  `);
}

export function dashboardPage(): string {
  return SHELL('Dashboard', `
    <div class="card">
      <h1>Divinity Works</h1>
      <p>The desktop app is where the work happens. This dashboard is for managing your account.</p>
      <div id="content" style="margin-top: 24px;">
        <p style="font-size:14px;color:#525258">Loading…</p>
      </div>
    </div>
    <script>
      const token = localStorage.getItem('dw_access_token');
      const content = document.getElementById('content');
      if (!token) {
        content.innerHTML = '<p style="font-size:14px;margin-bottom:16px">You are not signed in.</p><a href="/signin" class="btn" style="display:inline-block;text-align:center;text-decoration:none">Sign in</a>';
      } else {
        fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } })
          .then(res => res.ok ? res.json() : Promise.reject(new Error('Not authenticated')))
          .then(data => {
            content.innerHTML = '
              <div style="margin-bottom: 16px;">
                <div style="font-size:13px;color:#525258;margin-bottom:4px">Signed in as</div>
                <div style="font-size:16px;font-weight:500">' + data.user.email + '</div>
              </div>
              <div style="margin-bottom: 16px;">
                <div style="font-size:13px;color:#525258;margin-bottom:4px">Plan</div>
                <div style="font-size:16px;font-weight:500">' + data.subscription.planId + ' (' + data.subscription.status + ')</div>
              </div>
              <div style="margin-bottom: 24px;">
                <div style="font-size:13px;color:#525258;margin-bottom:4px">Usage this month</div>
                <div style="font-size:16px;font-weight:500">' + data.usage.creditsUsed + ' credits</div>
              </div>
              <button id="logout" class="btn btn--ghost">Sign out</button>
            ';
            document.getElementById('logout').addEventListener('click', async () => {
              await fetch('/auth/logout', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token },
              });
              localStorage.removeItem('dw_access_token');
              localStorage.removeItem('dw_refresh_token');
              window.location.href = '/signin';
            });
          })
          .catch(() => {
            localStorage.removeItem('dw_access_token');
            localStorage.removeItem('dw_refresh_token');
            content.innerHTML = '<p style="font-size:14px;margin-bottom:16px">Your session has expired.</p><a href="/signin" class="btn" style="display:inline-block;text-align:center;text-decoration:none">Sign in again</a>';
          });
      }
    </script>
  `);
}
