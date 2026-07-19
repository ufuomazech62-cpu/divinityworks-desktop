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
  <link rel="icon" href="https://divinityworks.space/i/logo.png" />
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
      <img src="https://divinityworks.space/i/logo.png" alt="Divinity" />
      <span>Divinity<span class="brand__sub">Works</span></span>
    </div>
    <div class="nav__right">
      <span id="user-email"></span>
      <button id="logout-btn">Sign out</button>
    </div>
  </header>

  <!-- Loading screen -->
  <div class="loading" id="loading">
    <img src="https://divinityworks.space/i/logo.png" class="loading__logo" alt="" />
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
    const token = localStorage.getItem('dw_access_token');
    if (!token) {
      window.location.href = '/signin?desktop=1';
    }

    async function spawnContainer() {
      const loadingEl = document.getElementById('loading');
      const titleEl = document.getElementById('loading-title');
      const textEl = document.getElementById('loading-text');
      const vncContainer = document.getElementById('vnc-container');
      const vncFrame = document.getElementById('vnc-frame');
      const errorScreen = document.getElementById('error-screen');
      const errorMessage = document.getElementById('error-message');

      try {
        // Fetch user info
        const meRes = await fetch('/api/me', { headers: { Authorization: 'Bearer ' + token } });
        if (!meRes.ok) {
          window.location.href = '/signin?desktop=1';
          return;
        }
        const me = await meRes.json();
        document.getElementById('user-email').textContent = me.user.email;

        // Spawn the container
        titleEl.textContent = 'Starting your Divinity…';
        textEl.textContent = 'Spinning up your personal workspace. This takes 5-10 seconds.';

        const spawnRes = await fetch('/api/cloud/spawn', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
        });
        const spawnData = await spawnRes.json();

        if (!spawnRes.ok) {
          throw new Error(spawnData.error || 'Failed to start container');
        }

        // Wait for the container to be ready (poll status)
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max
        const poll = async () => {
          attempts++;
          const statusRes = await fetch('/api/cloud/status', {
            headers: { Authorization: 'Bearer ' + token },
          });
          const statusData = await statusRes.json();

          if (statusData.status === 'running') {
            // Container is ready — show the VNC client
            loadingEl.style.display = 'none';
            vncContainer.style.display = 'flex';
            // The VNC iframe loads the noVNC HTML5 client, which connects
            // to the container's websockify port via the Worker proxy.
            vncFrame.src = '/vnc/' + me.user.id + '/vnc.html?autoconnect=1&resize=scale&password=';
          } else if (attempts < maxAttempts) {
            titleEl.textContent = 'Almost ready…';
            textEl.textContent = 'Divinity is loading. ' + attempts + 's…';
            setTimeout(poll, 1000);
          } else {
            throw new Error('Container did not start in time. Please try again.');
          }
        };

        // Give the container 3 seconds to boot before polling
        setTimeout(poll, 3000);
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

    spawnContainer();
  </script>
</body>
</html>`;
}
