/**
 * Cloud Divinity — web client page.
 *
 * When a user goes to app.divinityworks.space, this page:
 *   1. Checks if they're signed in (redirects to /signin if not)
 *   2. Calls /api/cloud/spawn to start their container
 *   3. Shows a "Starting your Divinity…" loading screen
 *   4. Once the container is ready, embeds the noVNC client in an iframe
 *   5. The user sees the full Divinity desktop app in their browser
 *
 * The noVNC client connects via WebSocket to the container's websockify
 * port, which is proxied through the Cloudflare Worker.
 */

export function cloudAppPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
  <title>Divinity Works — Cloud</title>
  <link rel="icon" href="data:image/png;base64,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" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: "Geist", -apple-system, sans-serif;
      background: #0a0a0a; color: #fff;
      display: flex; flex-direction: column; height: 100vh;
      letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
    }
    .nav {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px;
      background: #0a0a0a;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
    }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
    .brand img { width: 24px; height: 24px; border-radius: 6px; }
    .brand__sub { color: rgba(255,255,255,0.5); font-weight: 500; }
    .nav__right { display: flex; gap: 16px; font-size: 13px; color: rgba(255,255,255,0.6); }
    .nav__right a { color: rgba(255,255,255,0.8); text-decoration: none; }
    .nav__right a:hover { color: #fff; }
    .nav__right button {
      background: rgba(255,255,255,0.08); color: #fff; border: none;
      padding: 6px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
      font-family: inherit;
    }
    .nav__right button:hover { background: rgba(255,255,255,0.12); }

    /* Loading screen */
    .loading {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 24px;
    }
    .loading__logo { width: 64px; height: 64px; border-radius: 14px; }
    .loading__title { font-size: 20px; font-weight: 600; }
    .loading__text { color: rgba(255,255,255,0.5); font-size: 14px; text-align: center; max-width: 320px; line-height: 1.5; }
    .spinner {
      width: 28px; height: 28px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* VNC container — fills the screen */
    .vnc-container {
      flex: 1; width: 100%; position: relative; background: #000;
      display: none; /* hidden until container is ready */
    }
    .vnc-container iframe {
      width: 100%; height: 100%; border: none;
    }
    .vnc-error {
      flex: 1; display: none; flex-direction: column; align-items: center;
      justify-content: center; gap: 16px; color: rgba(255,255,255,0.7);
    }
    .vnc-error button {
      padding: 10px 20px; background: #fff; color: #0a0a0a; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
      font-family: inherit;
    }
  </style>
</head>
<body>
  <header class="nav">
    <div class="brand">
      <img src="data:image/png;base64,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" alt="Divinity" />
      <span>Divinity<span class="brand__sub">Works</span></span>
    </div>
    <div class="nav__right">
      <span id="user-email"></span>
      <button id="logout-btn">Sign out</button>
    </div>
  </header>

  <!-- Loading screen -->
  <div class="loading" id="loading">
    <img src="data:image/png;base64,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" class="loading__logo" alt="" />
    <div class="spinner"></div>
    <div>
      <div class="loading__title" id="loading-title">Starting your Divinity…</div>
      <div class="loading__text" id="loading-text">Spinning up your personal workspace. This takes 5-10 seconds.</div>
    </div>
  </div>

  <!-- VNC client (hidden until ready) -->
  <div class="vnc-container" id="vnc-container">
    <iframe id="vnc-frame" allow="clipboard-read; clipboard-write; microphone; camera"></iframe>
  </div>

  <!-- Error screen -->
  <div class="vnc-error" id="error-screen">
    <div style="font-size: 18px; font-weight: 600;">Connection failed</div>
    <div id="error-message" style="font-size: 14px; max-width: 400px; text-align: center;"></div>
    <button onclick="location.reload()">Try again</button>
  </div>

  <script>
    // Grab token from URL (OAuth callback) or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('access_token');
    const urlRefresh = urlParams.get('refresh_token');
    if (urlToken) {
      localStorage.setItem('dw_access_token', urlToken);
      if (urlRefresh) localStorage.setItem('dw_refresh_token', urlRefresh);
      // Clean the URL
      window.history.replaceState({}, '', '/app');
    }
    const token = localStorage.getItem('dw_access_token');
    if (!token) {
      window.location.href = '/signin';
    }

    async function connectToContainer() {
      const loadingEl = document.getElementById('loading');
      const titleEl = document.getElementById('loading-title');
      const textEl = document.getElementById('loading-text');
      const vncContainer = document.getElementById('vnc-container');
      const vncFrame = document.getElementById('vnc-frame');
      const errorScreen = document.getElementById('error-screen');
      const errorMessage = document.getElementById('error-message');

      try {
        // Fetch user info (validates auth)
        const meRes = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
        if (!meRes.ok) {
          window.location.href = '/signin';
          return;
        }
        const me = await meRes.json();
        document.getElementById('user-email').textContent = me.user.email;

        // Try to spawn the container via the API
        titleEl.textContent = 'Starting your Divinity…';
        textEl.textContent = 'Spinning up your personal workspace.';

        try {
          await fetch('/api/cloud/spawn', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
          });
        } catch (e) {
          // Spawn API might not be configured yet — fall through to direct connect
        }

        // Poll the container's noVNC endpoint directly
        const vncUrl = 'https://app.divinityworks.space/vnc.html?autoconnect=1&resize=scale&host=app.divinityworks.space&port=443&encrypt=1&path=websockify&password=';
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max

        const poll = async () => {
          attempts++;
          try {
            const check = await fetch('https://app.divinityworks.space/vnc.html', { method: 'HEAD', mode: 'no-cors' });
            // If we get here, noVNC is responding (even a CORS-blocked opaque response means it's up)
            loadingEl.style.display = 'none';
            vncContainer.style.display = 'flex';
            vncFrame.src = vncUrl;
            return;
          } catch (e) {
            // noVNC not ready yet
          }

          if (attempts < maxAttempts) {
            titleEl.textContent = 'Almost ready…';
            textEl.textContent = 'Divinity is loading. ' + attempts + 's…';
            setTimeout(poll, 1000);
          } else {
            throw new Error('Container did not start in time. Please try again.');
          }
        };

        // Start polling after 5 seconds (container boot time)
        setTimeout(poll, 5000);
      } catch (err) {
        loadingEl.style.display = 'none';
        errorScreen.style.display = 'flex';
        errorMessage.textContent = err.message;
      }
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });
      localStorage.removeItem('dw_access_token');
      localStorage.removeItem('dw_refresh_token');
      window.location.href = '/signin';
    });

    connectToContainer();
  </script>
</body>
</html>`;
}
