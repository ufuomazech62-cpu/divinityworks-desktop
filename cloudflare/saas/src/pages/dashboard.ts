/**
 * Divinity Works — sign-in page + cloud agent.
 *
 * /signin — Google sign-in page (ONE auth page, consistent branding)
 * /       — the agent itself (chat interface, NOT a management dashboard)
 *
 * After Google OAuth callback, user is redirected to /?access_token=...
 * which renders the full agent interface directly.
 */

// Inline base64 logo — identical to the landing page. No R2 dependency.
const LOGO_B64 = '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';

const LOGO_DATA = `data:image/png;base64,${LOGO_B64}`;
const LOGO_IMG = `<img src="${LOGO_DATA}" alt="Divinity" width="64" height="64" style="border-radius:14px;" />`;
const LOGO_IMG_SM = `<img src="${LOGO_DATA}" alt="Divinity" width="28" height="28" style="border-radius:7px;" />`;

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
  <link rel="icon" href="${LOGO_DATA}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff;
      --bg-soft: #fafafa;
      --bg-deep: #0a0a0a;
      --border: #ececef;
      --border-strong: #d4d4d8;
      --text: #0a0a0a;
      --muted: #525258;
      --muted-soft: #71717a;
      --radius: 10px;
      --radius-lg: 14px;
      --ease: cubic-bezier(0.16, 1, 0.3, 1);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg); color: var(--text);
      line-height: 1.5; letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
      font-feature-settings: "ss01", "cv11";
    }
    a { color: inherit; text-decoration: none; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;

export function signinPage(): string {
  return SHELL('Sign in \u2014 Divinity Works', `
  <style>
    .auth-page {
      display: flex; flex-direction: column; min-height: 100vh;
    }
    .nav {
      position: sticky; top: 0; z-index: 30;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: saturate(180%) blur(16px);
      -webkit-backdrop-filter: saturate(180%) blur(16px);
      border-bottom: 1px solid var(--border);
    }
    .nav__inner {
      max-width: 1120px; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 24px;
    }
    .brand { font-weight: 600; font-size: 16px; letter-spacing: -0.02em; display: inline-flex; align-items: center; gap: 10px; }
    .brand__mark { width: 30px; height: 30px; border-radius: 7px; flex: none; }
    .brand__sub { color: var(--muted); font-weight: 500; margin-left: 2px; }
    .nav__links { display: flex; gap: 24px; font-size: 14px; color: var(--muted); }
    .nav__links a { transition: color .15s var(--ease); }
    .nav__links a:hover { color: var(--text); }
    .main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 64px 24px; }
    .card { width: 100%; max-width: 400px; text-align: center; }
    .logo { width: 72px; height: 72px; margin: 0 auto 24px; }
    .logo img { width: 100%; height: 100%; }
    .card h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.035em; margin-bottom: 8px; }
    .card p { color: var(--muted); font-size: 15px; margin-bottom: 32px; }
    .google-btn {
      display: inline-flex; align-items: center; gap: 12px;
      padding: 12px 24px; font-size: 15px; font-weight: 500;
      background: var(--bg); color: var(--text);
      border: 1px solid var(--border-strong); border-radius: var(--radius);
      font-family: inherit; letter-spacing: inherit; cursor: pointer;
      transition: border-color .15s var(--ease), box-shadow .15s var(--ease);
    }
    .google-btn:hover { border-color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .footer { border-top: 1px solid var(--border); padding: 24px; text-align: center; font-size: 13px; color: var(--muted-soft); }
  </style>
  <div class="auth-page">
    <header class="nav">
      <div class="nav__inner">
        <a class="brand" href="https://divinityworks.space" aria-label="Divinity Works">
          <img class="brand__mark" src="${LOGO_DATA}" alt="Divinity" />
          <span>Divinity<span class="brand__sub">Works</span></span>
        </a>
        <nav class="nav__links">
          <a href="https://divinityworks.space">Home</a>
        </nav>
      </div>
    </header>
    <main class="main">
      <div class="card">
        <div class="logo">${LOGO_IMG}</div>
        <h1>Sign in to Divinity</h1>
        <p>Use your Google account to continue.</p>
        <a id="google-btn" href="/auth/google" class="google-btn">
          ${GOOGLE_ICON}
          Sign in with Google
        </a>
      </div>
    </main>
    <footer class="footer">\u00a9 ${new Date().getFullYear()} Divinity Works</footer>
  </div>
  `);
}

export function signupPage(): string {
  return signinPage();
}

export function dashboardPage(): string {
  return SHELL('Divinity Works', `
  <style>
    .agent-layout {
      display: flex; height: 100vh; overflow: hidden;
    }
    /* Sidebar */
    .agent-sidebar {
      width: 260px; flex-shrink: 0;
      background: #fafafa; border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
    }
    .agent-sidebar__header {
      padding: 16px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
    }
    .agent-sidebar__header img { width: 28px; height: 28px; border-radius: 7px; }
    .agent-sidebar__header span { font-weight: 600; font-size: 15px; }
    .agent-sidebar__new {
      margin: 12px; padding: 10px 16px;
      background: var(--bg-deep); color: #fff; border: none; border-radius: var(--radius);
      font-family: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
      display: flex; align-items: center; gap: 8px; justify-content: center;
      transition: opacity .15s var(--ease);
    }
    .agent-sidebar__new:hover { opacity: 0.88; }
    .agent-sidebar__list {
      flex: 1; overflow-y: auto; padding: 8px;
    }
    .agent-sidebar__section {
      font-size: 11px; font-weight: 600; color: var(--muted-soft);
      text-transform: uppercase; letter-spacing: 0.05em;
      padding: 12px 12px 6px;
    }
    .agent-chat-item {
      padding: 8px 12px; border-radius: 8px; font-size: 14px; color: var(--muted);
      cursor: pointer; transition: background .12s var(--ease);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .agent-chat-item:hover { background: rgba(0,0,0,0.04); }
    .agent-chat-item--active { background: rgba(0,0,0,0.06); color: var(--text); font-weight: 500; }
    .agent-sidebar__footer {
      padding: 12px 16px; border-top: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
    }
    .agent-user { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
    .agent-user__avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--bg-deep); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600;
    }
    .agent-logout {
      background: none; border: none; cursor: pointer; color: var(--muted-soft);
      font-family: inherit; font-size: 13px; padding: 4px 8px; border-radius: 6px;
    }
    .agent-logout:hover { background: rgba(0,0,0,0.04); color: var(--text); }
    /* Chat area */
    .agent-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .agent-header {
      padding: 12px 24px; border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
    }
    .agent-header__title { font-size: 14px; font-weight: 500; color: var(--muted); }
    .agent-messages {
      flex: 1; overflow-y: auto; padding: 24px;
      display: flex; flex-direction: column; gap: 16px;
    }
    .msg { display: flex; gap: 12px; max-width: 800px; margin: 0 auto; width: 100%; }
    .msg__avatar {
      width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600;
    }
    .msg__avatar--user { background: #e8e8ec; color: var(--text); }
    .msg__avatar--ai { background: var(--bg-deep); }
    .msg__avatar--ai img { width: 20px; height: 20px; border-radius: 4px; }
    .msg__body { flex: 1; min-width: 0; }
    .msg__name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .msg__text { font-size: 15px; line-height: 1.6; color: var(--text); white-space: pre-wrap; word-wrap: break-word; }
    .msg__text--muted { color: var(--muted); }
    .agent-input {
      padding: 16px 24px; border-top: 1px solid var(--border);
      display: flex; gap: 12px; align-items: flex-end;
    }
    .agent-input__wrap { flex: 1; max-width: 800px; margin: 0 auto; width: 100%; display: flex; gap: 12px; align-items: flex-end; }
    .agent-input__field {
      flex: 1; padding: 12px 16px;
      border: 1px solid var(--border-strong); border-radius: var(--radius);
      font-family: inherit; font-size: 15px; resize: none;
      min-height: 44px; max-height: 200px; outline: none;
      transition: border-color .15s var(--ease);
    }
    .agent-input__field:focus { border-color: var(--text); }
    .agent-input__send {
      padding: 12px; width: 44px; height: 44px; flex-shrink: 0;
      background: var(--bg-deep); color: #fff; border: none; border-radius: var(--radius);
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: opacity .15s var(--ease);
    }
    .agent-input__send:hover { opacity: 0.88; }
    .agent-input__send:disabled { opacity: 0.4; cursor: not-allowed; }
    /* Typing indicator */
    .typing { display: inline-flex; gap: 4px; padding: 4px 0; }
    .typing span {
      width: 7px; height: 7px; border-radius: 50%; background: var(--muted-soft);
      animation: bounce 1.4s infinite ease-in-out both;
    }
    .typing span:nth-child(2) { animation-delay: 0.15s; }
    .typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
    /* Mobile */
    @media (max-width: 768px) {
      .agent-sidebar { display: none; }
      .agent-input { padding: 12px 16px; }
      .agent-messages { padding: 16px; }
    }
  </style>
  <div class="agent-layout">
    <aside class="agent-sidebar">
      <div class="agent-sidebar__header">
        <img src="${LOGO_DATA}" alt="Divinity" />
        <span>Divinity</span>
      </div>
      <button class="agent-sidebar__new" id="new-chat" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New chat
      </button>
      <div class="agent-sidebar__list" id="chat-list">
        <p class="agent-sidebar__section">Today</p>
        <div class="agent-chat-item agent-chat-item--active" data-id="new">New conversation</div>
      </div>
      <div class="agent-sidebar__footer">
        <div class="agent-user">
          <div class="agent-user__avatar" id="user-avatar">?</div>
          <span id="user-email">Loading\u2026</span>
        </div>
        <button class="agent-logout" id="logout-btn">Sign out</button>
      </div>
    </aside>
    <main class="agent-main">
      <header class="agent-header">
        <span class="agent-header__title">Divinity Agent</span>
      </header>
      <div class="agent-messages" id="messages">
        <div class="msg">
          <div class="msg__avatar msg__avatar--ai"><img src="${LOGO_DATA}" alt="" /></div>
          <div class="msg__body">
            <div class="msg__name">Divinity</div>
            <div class="msg__text">Hey! I'm Divinity, your AI coworker. Ask me anything \u2014 I can help you write, code, research, brainstorm, and more. What are you working on?</div>
          </div>
        </div>
      </div>
      <div class="agent-input">
        <div class="agent-input__wrap">
          <textarea class="agent-input__field" id="input" rows="1" placeholder="Message Divinity\u2026" disabled></textarea>
          <button class="agent-input__send" id="send" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </main>
  </div>
  <script>
    // ---- Token management ----
    const params = new URLSearchParams(window.location.search);
    let token = params.get('access_token') || localStorage.getItem('dw_access_token');
    if (token) {
      localStorage.setItem('dw_access_token', token);
      const refreshToken = params.get('refresh_token');
      if (refreshToken) localStorage.setItem('dw_refresh_token', refreshToken);
      window.history.replaceState({}, '', '/');
    }

    const input = document.getElementById('input');
    const sendBtn = document.getElementById('send');
    const messages = document.getElementById('messages');
    const userEmail = document.getElementById('user-email');
    const userAvatar = document.getElementById('user-avatar');
    const newChatBtn = document.getElementById('new-chat');
    const logoutBtn = document.getElementById('logout-btn');

    // ---- Load user info ----
    async function init() {
      if (!token) {
        window.location.href = '/signin';
        return;
      }
      try {
        const res = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
        if (!res.ok) { throw new Error('auth failed'); }
        const data = await res.json();
        const email = data.user.email;
        userEmail.textContent = email.length > 20 ? email.slice(0, 18) + '\u2026' : email;
        userAvatar.textContent = email[0].toUpperCase();
        input.disabled = false;
        input.focus();
      } catch (e) {
        localStorage.removeItem('dw_access_token');
        localStorage.removeItem('dw_refresh_token');
        window.location.href = '/signin';
      }
    }

    // ---- Chat ----
    let messages_history = [];

    function addMessage(role, text) {
      const div = document.createElement('div');
      div.className = 'msg';
      const avatar = document.createElement('div');
      const body = document.createElement('div');
      body.className = 'msg__body';
      const name = document.createElement('div');
      const textEl = document.createElement('div');

      if (role === 'user') {
        avatar.className = 'msg__avatar msg__avatar--user';
        avatar.textContent = userAvatar.textContent;
        name.textContent = 'You';
      } else {
        avatar.className = 'msg__avatar msg__avatar--ai';
        avatar.innerHTML = '<img src="' + data:image/png;base64,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 + '" alt="" />';
        name.textContent = 'Divinity';
      }
      name.className = 'msg__name';
      textEl.className = 'msg__text' + (role === 'user' ? '' : '');
      textEl.textContent = text;
      body.appendChild(name);
      body.appendChild(textEl);
      div.appendChild(avatar);
      div.appendChild(body);
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
      return textEl;
    }

    function addTyping() {
      const div = document.createElement('div');
      div.className = 'msg';
      div.id = 'typing-msg';
      div.innerHTML = '<div class="msg__avatar msg__avatar--ai"><img src="' + data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAaiklEQVR4nO2de7AsRX3HP+ecCwSfN7w0RTSiRoT4hgA+SpEYH4gmxlSQ61VTakwiarRMAMtoxYpJgRoNiRoVKAXhaiSoWCIiKjFRMAKGgK+AAb2lqBEvKiCPe87Z/NHzy/T2nd3t7unZ2d3z/VR17Tk7Mz0zvf179K9fIIQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIUTvLPX9AHPOLJffoO8HELPPLFfgWWYFWGe2hWyJ+vcNPwfe54DZfg/RIVIA7dit+gyFbUBz2frfDUZ8t8SwQC4F3/vHm/5fq1IKy1WCWrFJKWwApADSWMYJyFbgeGAzzhtYohagZZoF2Y7b900KwPAFennM8XV2VQA7gTuBu7zPncAPgRuB24Brq/+3AzdV34XYe61XSSwgUgDxmPAfBHyj52cpxW3AzcD/AFcDVwFXAP+NUx7GEnWzR8pggZACiGcF51o/Gfg8zqqu9PpE4wld+LBZ4XstPuvADcClwCXAF4HrgmutLNRMEBsGU5abce7zOrUQpKb1Cd+POl46mUVfxSm0nQ3n3AF8Afgz4MCgTFZoViJCLCRm8d+AE467mI6gTjOZYtuJUwz+sTuBzwB/iFOEfrlIEYiFx9zmewLXU1vPtpY/xkqvR+TThQfhewj+99uBk4GHeOXj9yYIsZCYF/BMnCDsZHouexshLqEYTBn4Su8XwDnA44IykiIQC4spgfdTK4E2Fj8U0NDah/k05TvOQ8gV/HGehjUT/O/PZ1gRbEKBZrGAmKv7y8B3iQsIlvISmhRCyfvmnB96QduAg73ymuXeEiGysEr9FGovYFRbPfYzFPJYj2DU/SZ9P0nJpFwXKoJbgVOAvapyWkbegFgwNlWff0WtBEpY+bYeQhvLXuJ6P0bwHWCLV2byBsTCYINiAD6Lq/DjegViLWpulD/H0nepiHyF+GFg/6qsbJixEHOPubb7Ad/DVfa28YBxx2e9xyFMa9RK8UbgeUHZCTH3mBfwJOo+85h++3FCXmrMQIoSye0ujOl18L2BM4B7VGVmzSgh5hqryK/CVfK7iA+elVYEs5bsHXxv4BrgUUHZCTHXWEV+P8NWLzcKH2uZ2zQp2l6XM/7AhlDfAhxXlZniAmLusaDg7sCX2NX1LWHNpzFhqG1PQEzyg6Vv9spPcQEx11gFvi91UDB2vsCk8QFN5zX118eMM0gR6FjLnuqp+E2C06g9KCkBMbMsM7kv244fBtxOvUzXNKx0isDOQlqnbhJ8BjfRyi9DIWaSSe1Vs2bH4Sp37KShmJF+bZRDl8qnTe+BKYEvAntXZSdPQMwMJvAPAo4JvhuFKYFXU1fyNsI5jfZ/n8mUwJVICYgZw4T5VFwl/ZPq/0muql33TwxX8hwrm9umL9WvX7pp0XS9lc9l1IuOSAmI3jFBPx3Xnv8xsC/DS4I34Q8XPo80JRAjZIswajB8Tus5uRQXE1DvgOgdE+IzqCvq24Njo7AKfHfgywxX8pKWObYXYBpC3DYPU5IXeOWncQKiN8JFQFZxy2o/gDgLZcf3wi3BnaMEYlzw0sLepxdhSuD0quw0YlD0himAD+Aq5e3V5/uD4zF5HICbGGOKJFfoulQAOcOY26w3MGnU4OursrPdmISYKia8Z+EqpK2auwYcHpwTk8+jgR1VXk1jBNpMBurLYneR/HECf5BQzkIUxSrdmdQKwFz4fw/OmYS5so+n3UChaTQBUu/fRX5WPj+j3ptAQUExVZoUwIDahd8SnDcJUwLPwVX8Ndp3182ycLdNVs5fBfZEk4fElAljAKYATHC3A/cmLVptSuCF1JW8zWjB0k2AWVMCVubvDspPiM4xBfBBhiujb53eEZwbgwW1XuzlVWK04KImK/dnZZS1ENlYRdvGrgpgnXoloEOD82MwS3a8l3dK+35SNL7tegBdjPgLv18P0qi8LB7wPWAftBuRmBIm0GezqwIYUHsBl1HPGExpo5oSeK2Xf25PQNdWeNwiINNIVvbnVGUmL0B0TtgN2NR/bxXzFcE1sZgSeL2X3yy69H1PN16nLuujqzKTEhCdMq4J4FfMNdxSV79G3hh2UwIneveZRSXQd7Lg67dxQ6w1VFh0SpMCaBJM8ww+HlyXgimBE0bcq6mdHOOWl14BKPb83NjFpPNMCb+pKi95AaIzrHJ9iGFBb0pWMbcG16ZgSuDPvfuVXlUoN/XtkfjByVXcNmQPRLMGRYeECmDcRB6LVP8It2FIbqTalMArqZVA34HBPqYfj5vdaL/D2VVZyQsQnWAV61xqYRxXae24VczcQSt23csYVi59WuBZSzlzMoRIwirVRxi2PDFK4Jggj1RMCWylbv9vZCUwagGRC6tykgIQxbFK9S/EKwB/0MretBu0YiMGnwvcwbCC2YgpDHpar4C8ANEJOQrAP88GrbQZv27XHgncHOSf0v4uNbKvbW9B22dqigWcV5WRgoGiKOG6fimr+ZToFTBMCRwCfD/jWRY1mRewE3hYVUbyAkQxrDJ9lHShs6bAT4D70b67ypTAA3GbbA5IW2h0mkLZxfmjPBD7Td5TlY8UgCiGVaaPka4ABtTt9YuD/No+zz64BUlGKYFFWzNgUjNiHdc82q8qH40OHIPaSenkltkKTgk8BXgNziNoEw9Yq/K8CXgqLjaxG7WiofosJQCDhu+WRhxrOjcm70nXhec1nb+G20/g+dX/8gJEEUzwL2DYoqdar1VcFP9RVX5tK6ivkN5e3aftWIEuFxbt2muw974Gp2DlAYgimKBdSLoC8Cu9XXcV5Za28mMKx3v3C5+xbU/BqKh/7roB4arA4/KPXS/AVwJPrspEXoBojVWiTxGvAEZV1C6Wtlry8nk6rmlg95rnhUJzkpXvmVV5SAGI1uQogHFCYpX0uUH+bTElcDD99RCkRPNzvJJJHocNCrqJepNRNQVEK8zF/jTtFYBfSUt1DfqYEtgL+IT3vLNgnaeV7Pc5LigT4aFegHSaLMkg+Bx13GcZJ5B7US81Pmmj0VhWcR7FDuDZwFuoYw1rBfIfRdN7jiqT1HxizhsEfw+oPayc5xDi/xnlAcQu4z3qmDUF3ljlX9JS+XMPng/8PLjnvKWc5sLNaEyAKIAJ0kUMK4ASFdfc866i1qZUHg5cQa0ESq36O4sKwN5xADwvKAdRoSZAOjnCOcny2PFtwH1xFb3kb7OKq/zXAE/EDZW1PvK1iOfLZVA4v/A5Y/If4HpFYs8XohETyItJ9wBiLJnl98nqPl1YK1+pbMUFIENvYJYtfOo4BBsPcD2wR/XeagaILEx4PkctsKWFxlzWE6t7daEElqi9mF8HPkstPKmjB/tYDjzlmD9w6JDqnTUmQGQRowAmWaiYCm7bjh9R3a+rCusrl5OoxwrExAZij3ehQCatjtxUngPcCMnwvYWIxhSAWcyuIunWFPgmcDe63QXX7yU4DLicWnBimziz0HSIKc+PVO8pD0Bk0eQBxApH6so5plxOre7ZdaU1q/hLwJtp9gZilUHbbtGY81M8FGvWXAvsXr2n4gAimRwFkJt8C/zE6r5dKwE//8OAL3vPM89rD5oyuAN4cPV+6v2qUEGkM5jSfcxKvRMXwR7QreWy7sBNwFeAJwB/AfwMpxxs6HJJplGW1tW5B/AI7zuBFEAOOZUnpaKboC/jLO/DgVfhhK9rL8Csvd37bbjo+TnVvZepXeoStBHE1DIFeGSB+4oNSmoToE1wzK711xLcj+lufeVPLwZ4JnCl94wWH+gzCBh7b/utbMVgBQIr5AGkE2s92lgZu9afMPRqum8G+PjewApuJaQjcNuU/YB6JKEJYR+k/hYPxr1L6aaM2ACYsvw87QNjKeMD/Lnt5gX04cL6VnNf4G+o9ybwPYK+vIGYcv4Jbr1AUDNAJGIK4BLaK4DUZN2CJ1XP0NdgFn8UIcABuCDlrcyHIlil3jNA3q9Iok03YFuBsFGH38L1ZfdtvcL4wENwy5v9lGFF0Hb/wpKKxJ7lt6pnVhwAacFp0VZgV3CV90BcH/2AfiuwKSWLD1wLvBwXZT8Zty36JuoYRm7PQUlFZ+3+B3SQ99wiBZBOTkUugVXgZ1Wfs1CBTbhNEXwXeB1OEZwAfMM7tsTw/Im++JUe7z1zSAGk05fg2W/1VOr++FnBVwSbcB7AW3F7Hzwb1/12G7VXANNTBmH+e3Z8P7GgjIsBpM6aS50t5/e33wrcP3imWSOMEYDbx/AEhscS2LvZDMg14sondhai/7+WChetyFEApdO8bXhhvQbLwXeH4RYqtWXLw4CnBRBzFUFTst/rguo5Zr3spsKsWpBZxtrivms5qVlQys21ez8o8r59Y0rLljjbVH33FZw38EjcUOPXAV/ENRNWqJsKNo7fvAO/VwHylggzz6TPOMTMoMUR0lkKPlOuaYtV2v0L5TdNrBkD9ToEq8BXq3QyrmlzOPAk4PG4Xo+UNntMOcvoeUgBzBdWwfcYe9bsY8rARjVaUHN7lc7FeQL3Bw7CzeJ7JG4DlfsAd8ft+LMb6cp11r2mqSIFkM4sVKB5VwA+vkflu+VrwA24rsX/wg3BfgROIewH/CZuTcNZ+D3mFimAfHLakAPKTIH9RYs8+saf0WjtemMfnIAfWqWH4CbwbB6RV/gbhOXbVN5q+3tIAeSTI8h2TVtFcFeLa/vCD+qZ0O8OPAY4CngKzs3fa8T14ZgBy89n0v+Wj6iQAkinhAUZJfymGJo+/eu+X+AZpoF1A/qrCd0Nt9rQc4EjcVbeJwwW+lOjjVgF6p9nZbjqPduGRwognS4rTtjDEH6aEFxXfc6qOxt24YFbS2ALcAxuFqFhXYXWNLA0TsjbrMlwW+S1GwIpgHQGwWduHr6FH3U8/G4Zt8GnKYBZc2d9wQcXsf9d4AW4bj3DrLyd31QPR5VPaNVjys//rW708t/wSAHkU2LFnxQLZ2sCfgM31j6MmveJeSamkA7GzQ48FhfYg9rS+1Z+Ek3lsDTheNP3/v87Iu67YZACmE3GRa9td+JN1O51X4QW/1Dc0mW/T91VacdshF8Tkzyi8LxYms7/ecL1C48UQDqpVjcn4t90vs2t/1j1f5/uvz94B9xw3hNwgu/P9lshbsx97OjKNuVof19ffc6K99QrUgDzgbnOXwKuplYGfWBR/TWcq38ScBz1OH8T/Jy6lRPdjznP4icA/5vxXELssjfgtJcEGwC/Vz1DHzPZ/HveB3gHbkCS/4yzthZgWP63UC8IoiCgSMIUgLXBUyp86noATXvbXcXwghrTwl8IdAW3y+4PvGedh23DrAyvo45NSAGIJEzwPo2rTDm7A+dsimn3eUZ1/2laf/9eRwKXec8Ws/pvVx5B6rbrpqQuqt5FMwIrVBDxmMVYD/6fhFXCHNZwVv9zwIXU7e+u8Ufw7Q28B7cc+hHUno9tDOITvmfuOPxR54Vl2ZR/07X2m32t+lS9F8mEHkDXrq/tEHwH013L3rf6x+Jm45kbPQ/u/jgPYEv1Xgp+i2RMMD5FngLw1/WLcV3N9f/L4P5d4bf17wdsa3iWrlPbJsO4NRh3Ar9RvZ88AJGMVZoLyVMA4yroKIt1BW7RC1tWuyt85fIC3EhDe462m3tMQ/DHJXv+b6MA4C5IE8YTxgBSGAR5jKuAlv9twIsYtr5dsIm6rX82cBZuwQ3rz5+lOhKWwyD4bDrfyvNK4E7qTVYEagulEApxCinXWIDtlcDX6S7w54/YOwo4HTdLz1/ff1qkzu4bMLxJasycgH9NvJcQQ4QxgJR2cayLa3l+qLpXV0Lou/wnUbvJXbX1S7j4qTEU/5pV1P4XLSkVA/ArcthWXce1Ve9N84o3JTClcj/qQU3hktvznPyytd/o6zR3W254pA3jCWMAg+D4IPh70HDOEsOua3g+wEuAn1F+uq9N4FnFzdH/D9w2Y6vesRya3tM/VpLBiE+fpnUALqaOaQiRhVWeC8j3AEYlc73fUN2jtOvvV/w3efed13792KQtwUUxrPK0aQI0JcvnC9R98SVdVVMm+wKfoBaMNi5/30OAY84Ju//k/jegXoB4Bh3meSvwYoYrcltMmazihvCeg9ugcydubEHbvNsc7+q+/jm25Nj5uO6/WVhARcwxOU2AMGodWjBz/V8a3KMtfpv+RcDtwf1irWxq1L2tRY/dZTnmPAuqHl6Vg9x/0YrcXoBRlbWrLj8/mHeKd7+S7f2+5/3HjqS8ku56U8QGwwSryQMYVyGbuv3MOn0PtxFG7CKZkzArdy/gPGpFk9rez5m2nGLRc+8bex9TrsdX5aGmrmiNCWjuZKCmCnp0lWcJ99Qq+QE4y2f36dNa93FvU7g3Ua9ILA9AtCaMAeSOBDTFcVqVXwnrZHk8Frfu/QC3fVjXAl1q9l5q/pNm/Q2Af6zKRG1/UQSrSJ9kWJBTkrn+NwD3pH371N9UYyt1sG/R+/fHKYY1XNT/oKpcNNhNFMEUgPWlp3oAvnV6WpBnDn6k/0TvPn0Jf1PvQer1uWssWrLy/eeqXGT9RTGsMp2Pq2SpgmaV811VPm1cf9+qvct7npLddn1H+nOe1zysQxhe4ESI1lhl+iiTFUAoPCac23ER+jauvz3HHtSr9tzFrha46z78kool1vqPeydTsOdV5SPXXxTFBO/jTFYAoyrnMUFeuc+wGTd02M97nlOKkhqlQFZxbf+DaTe5SYhGQg9glOCN6pNu2y61634VuLzK0yL96w2phEDmjPnPacunzu8Pr7cyfm9QVkIUwyrVx4i3vDbp5qfA/uRbJosXHIzb2y72/rlWto+Uq7isjH+M27Go1KAqIYYwBXAukwUwtEx/GuSRggn/ocAPI+7dVghTLHUppZLqcfjnWVm8IigvIYpiwvth4oTQYgSfC65PwSrz43H72vv5jhPWlIBa1xZ6VDMhJ5+m4OoAt3ryJrpfPVlsYEyAz2a0AvAt1CpuZd8Dq+tS3VIT/qNx04X9Cu8LRFP0v5SlLjU2P/e6SXMsVqt0WFVWavuLzrDK9UEmewB27KTqmlS31M4/llroF2XNvlLJAqBvq8pKwi86xSrYBxivAExgryZvUw9brGML9eCWWOHPidqnHE9NXQUerYyvAfbMKGMhkjEFcAajFYA/FPcJwXUxmOV/SZWHjWwbJ1SzHt0vrTDWcGV/J/DojDIWIgsTzvexqwIIo/5nVOfmCP9Lqa3cKMuf2z/f1lK3VUaTxinE9EKY6/+aoNyE6BSraO9lVwVglmkN11W3L2n90Zb3H1MLfxvL3tdcgK69ESvzjwblJkTnWGWzyTfhYhu56/tZvrYoaAnhD6PsuV1xMfnkKICcZoy/yce90VJfYsqYoL6HYYH3K+eXcRUzNigVtvnbCv+8p1Hv7o+o1BZfohdMWN9NrQCswprgPrY6J8b6W7T/hUEek6x6jNVsO6Ivt60/7rw2YxFMwdoSanL9xdSxSvcP1ArA/3xfdTxF+LcyWfi7tKzzkCzo97KqzCT8ohes4v09teCba7oDNxElZrKP5fMcJvfzlx5rX+q6UsN7J11rwv/XQdkJMXWs8p1KrQDM+p8YnDMpj6OAO6gVQKqQ5EyjLWmVU+cF5HQXmvCf6pWdgn6iN0x434GrmCbA1+FGo02KStv1jwNuIU74mwR9XLvaP7+Ewkht65fqfjTh9+f3S/hFr5gA/x2uctoKvMdW349r+9uxQ4Cbq+u6XLxzXtv8vvC/2ys7Cb/oHVMAb6GurNbtN67db8L/UOBHxAl/rkXNnbLbt3Kx57Ym1Tu9spPwi5nAFMBbqV33J1XfjbL+phj2w21THSP8GzH5gdA3eWUq4RczgymAl+Mq6qQ1/iwmcC/gK9U1ZuGmNSuvbbCwVJBx3PFV7/OPvDKV8IuZZDfgGTjBXqK5olp34DJwEa6Cl96qKyVAVzJIV1JZmULcAfx2VXbq6hNzjb9d12m4Cn4n6UJVoj0/aSz/pNGEk0by5T6n396/inp4r4RfzAXjXNQwWDjK8peYnjuPyY+BnAXcIyg3IeaWcGZfuGNPacud22aPvX9svrEzC00Z3kq9UjJoQQ+xAFglfir1BJauLPmkobglJuGUtvr2HJcCj/LKTME+MfeY8B+IC2ilrOMXY9nbWuhS16c+ly3fNcANnHojtZckl18sBBbx34xbpNIs3jSsfl8pRhH46yVcQr1+H2guv1gQ/Ii/bRs+br+ANkIdMwOvtCXP8UT897+R4ba+JvSIhcKE/29xFb4p4j/t9nhs913pe/pezy+AU3BrI4J26xULiLX7f4fa8pew9DHXdR0jSHk+3+KvAduAhzWUkxALgw3zfTBudl/T+v3TtPrTTn5wb4Cz/ttwG5gaivCLhWSJunL/G7X1b2OxR52/HqRRx1Mt/7jhwpOE3u/d2AGcDjzGK58V5O6LBcZc2tczLPw5Aj7rydr2Ya/G1cBrgf2DcpHgi4XGKvhDceP7Ywf7TEvgS4wHWGVXSz/AbXhyJvB0htv1EnyxYbCKfi751n8W0jpOwE3YRwUwf4Br22+hjugb6tJbAPQDxrOEE4rNwHbcOoDrDFu/AdMp05z72Pnj1i7cAXwLF9u4BLgcF+Q0zPKbshBzjoZjprGEG9L6NepNQOaRW3CC/R2cwF8D/CfwTZwS8PGFfm1KzyemhDyANMwL2Bt4GnAAdRn6Ftb+b9ombKXhXPvbv9bPd7nhu6XgfKit8ipuUNKdOIV1F249wu3Az6vPn+IG7DS94wrDMQKxoEgBbGx8xSKB34BIAeRhVrJvRgnrqN/Vzl+fcL0QQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCHEnPB/n2GhzaDXNWoAAAAASUVORK5CYII= + '" alt="" /></div><div class="msg__body"><div class="msg__name">Divinity</div><div class="typing"><span></span><span></span><span></span></div></div>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    function removeTyping() {
      const t = document.getElementById('typing-msg');
      if (t) t.remove();
    }

    async function sendMessage() {
      const text = input.value.trim();
      if (!text || sendBtn.disabled) return;
      input.value = '';
      input.style.height = 'auto';
      sendBtn.disabled = true;
      addMessage('user', text);
      messages_history.push({ role: 'user', content: text });
      addTyping();

      try {
        const res = await fetch('/api/llm/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: JSON.stringify({
            model: 'auto',
            messages: messages_history,
            stream: false,
          }),
        });
        removeTyping();
        if (!res.ok) {
          const err = await res.text();
          addMessage('assistant', 'Sorry, something went wrong. Please try again. (' + res.status + ')');
          return;
        }
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || 'No response received.';
        addMessage('assistant', reply);
        messages_history.push({ role: 'assistant', content: reply });
      } catch (e) {
        removeTyping();
        addMessage('assistant', 'Connection error. Please try again.');
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    }

    // ---- Input handling ----
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    sendBtn.addEventListener('click', sendMessage);

    newChatBtn.addEventListener('click', () => {
      messages_history = [];
      messages.innerHTML = '';
      addMessage('assistant', 'New conversation started. What can I help you with?');
      document.querySelectorAll('.agent-chat-item').forEach(el => el.classList.remove('agent-chat-item--active'));
      const newItem = document.createElement('div');
      newItem.className = 'agent-chat-item agent-chat-item--active';
      newItem.textContent = 'New conversation';
      newItem.dataset.id = 'new-' + Date.now();
      document.getElementById('chat-list').prepend(newItem);
    });

    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        });
      } catch (e) {}
      localStorage.removeItem('dw_access_token');
      localStorage.removeItem('dw_refresh_token');
      window.location.href = '/signin';
    });

    init();
  </script>
  `);
}
