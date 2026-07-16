addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const css = `:root {
  --bg: #0b0b0f;
  --bg-soft: #131319;
  --card: #17171f;
  --border: #26262f;
  --text: #f3f3f7;
  --muted: #a0a0b0;
  --accent: #7c6cff;
  --accent-2: #43e0c0;
  --radius: 16px;
  --maxw: 1080px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html { scroll-behavior: smooth; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }

/* ---------- Nav ---------- */
.nav {
  position: sticky; top: 0; z-index: 10;
  background: rgba(11, 11, 15, 0.72);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
.nav__inner {
  max-width: var(--maxw); margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 24px;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; }
.brand__mark { color: var(--accent); font-size: 22px; }
.brand__sub { color: var(--muted); font-weight: 500; margin-left: 4px; }
.nav__links { display: flex; gap: 28px; font-size: 15px; color: var(--muted); }
.nav__links a:hover { color: var(--text); }

/* ---------- Hero ---------- */
.hero {
  position: relative;
  background:
    radial-gradient(800px 400px at 70% -10%, rgba(124, 108, 255, 0.18), transparent 60%),
    radial-gradient(600px 300px at 10% 10%, rgba(67, 224, 192, 0.10), transparent 60%);
}
.hero__inner {
  max-width: var(--maxw); margin: 0 auto;
  padding: 96px 24px 80px; text-align: center;
}
.eyebrow {
  text-transform: uppercase; letter-spacing: 0.18em;
  font-size: 12px; color: var(--accent-2); font-weight: 700; margin-bottom: 18px;
}
.hero__title {
  font-size: clamp(36px, 6vw, 64px); line-height: 1.05;
  font-weight: 800; letter-spacing: -0.02em; margin-bottom: 22px;
}
.hero__lede { max-width: 620px; margin: 0 auto 34px; color: var(--muted); font-size: 18px; }
.hero__cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.hero__note { margin-top: 18px; font-size: 13px; color: var(--muted); }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 13px 26px; border-radius: 999px; font-weight: 600; font-size: 15px;
  transition: transform .12s ease, background .2s ease, border-color .2s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn--primary { background: var(--accent); color: #fff; }
.btn--primary:hover { background: #8d7fff; }
.btn--ghost { border: 1px solid var(--border); color: var(--text); }
.btn--ghost:hover { border-color: var(--accent); }

/* ---------- Features ---------- */
.features { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.features__inner {
  max-width: var(--maxw); margin: 0 auto; padding: 72px 24px;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 28px;
}
.feature { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 26px; }
.feature__icon { font-size: 28px; margin-bottom: 14px; }
.feature h3 { font-size: 17px; margin-bottom: 8px; }
.feature p { color: var(--muted); font-size: 14px; }

/* ---------- Download ---------- */
.download { background: var(--bg-soft); }
.download__inner { max-width: var(--maxw); margin: 0 auto; padding: 84px 24px; text-align: center; }
.download h2 { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -0.02em; }
.download__sub { color: var(--muted); margin: 12px 0 40px; font-size: 16px; }
.os-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 18px; max-width: 760px; margin: 0 auto;
}
.os-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 30px 20px; transition: transform .12s ease, border-color .2s ease, background .2s ease;
}
.os-card:hover { transform: translateY(-3px); border-color: var(--accent); background: #1c1c26; }
.os-card__icon { font-size: 34px; }
.os-card__name { font-size: 18px; font-weight: 700; }
.os-card__meta { font-size: 13px; color: var(--muted); }
.download__alt { margin-top: 32px; font-size: 14px; color: var(--muted); }
.download__alt a { color: var(--accent); }
.download__alt a:hover { text-decoration: underline; }

/* ---------- Live banner ---------- */
.live { border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: rgba(67, 224, 192, 0.04); }
.live__inner {
  max-width: var(--maxw); margin: 0 auto; padding: 16px 24px;
  display: flex; align-items: center; gap: 12px; justify-content: center;
  font-size: 15px; color: var(--text);
}
.live__dot {
  width: 10px; height: 10px; border-radius: 50%; background: var(--accent-2);
  box-shadow: 0 0 0 0 rgba(67, 224, 192, 0.6); animation: livePulse 1.8s infinite;
}
@keyframes livePulse {
  0% { box-shadow: 0 0 0 0 rgba(67, 224, 192, 0.6); }
  70% { box-shadow: 0 0 0 10px rgba(67, 224, 192, 0); }
  100% { box-shadow: 0 0 0 0 rgba(67, 224, 192, 0); }
}
.live__text a { color: var(--accent-2); font-weight: 600; }
.live__text a:hover { text-decoration: underline; }

/* ---------- Footer ---------- */
.footer { border-top: 1px solid var(--border); }
.footer__inner {
  max-width: var(--maxw); margin: 0 auto; padding: 28px 24px;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 14px; color: var(--muted);
}
.footer__links a:hover { color: var(--text); }

@media (max-width: 560px) {
  .nav__links { gap: 16px; font-size: 14px; }
  .hero__inner { padding: 64px 20px 56px; }
}
`;
  let page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Divinity Works — Your AI coworker with memory</title>
  <meta name="description" content="Divinity Works is a desktop AI agent with memory, built for private, local-first work. Download for macOS, Windows, and Linux." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="styles.css" />
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml" />
</head>
<body>
  <header class="nav">
    <div class="nav__inner">
      <a class="brand" href="/">
        <span class="brand__mark" aria-hidden="true">◇</span>
        <span class="brand__name">Divinity<span class="brand__sub">Works</span></span>
      </a>
      <nav class="nav__links">
        <a href="#features">Features</a>
        <a href="#download">Download</a>
        <a href="https://github.com/ufuomazech62-cpu/divinityworks-desktop" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </div>
  </header>

  <main>
    <section class="hero">
      <div class="hero__inner">
        <p class="eyebrow">Private · Local-first · With memory</p>
        <h1 class="hero__title">Your AI coworker,<br />that actually remembers.</h1>
        <p class="hero__lede">
          Divinity Works runs on your machine and learns your work. No vendor lock-in,
          no surprise permissions — just a focused AI partner for everything you do.
        </p>
        <div class="hero__cta">
          <a class="btn btn--primary" href="#download">Download for free</a>
          <a class="btn btn--ghost" href="https://github.com/ufuomazech62-cpu/divinityworks-desktop" target="_blank" rel="noopener">View source</a>
        </div>
        <p class="hero__note">Free while in preview. macOS, Windows, and Linux.</p>
      </div>
    </section>

    <section class="live">
      <div class="live__inner">
        <span class="live__dot" aria-hidden="true"></span>
        <p class="live__text">
          Divinity is <strong>live now</strong>. Download the app and sign in to start your AI coworker.
        </p>
      </div>
    </section>

    <section id="features" class="features">
      <div class="features__inner">
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">🧠</div>
          <h3>Memory that sticks</h3>
          <p>Divinity remembers context across sessions so you never re-explain yourself.</p>
        </article>
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">🔒</div>
          <h3>Yours to keep</h3>
          <p>Your data stays on your computer. We host only what you explicitly choose to sync.</p>
        </article>
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">⚡</div>
          <h3>Fast, local-first</h3>
          <p>A native desktop app that launches instantly and stays responsive, even offline.</p>
        </article>
        <article class="feature">
          <div class="feature__icon" aria-hidden="true">🔌</div>
          <h3>Connects to your tools</h3>
          <p>Plug into the services you already use. Your account, your keys, your rules.</p>
        </article>
      </div>
    </section>

    <section id="download" class="download">
      <div class="download__inner">
        <h2>Get Divinity Works</h2>
        <p class="download__sub">Choose your platform. We'll take you to the latest build.</p>
        <div class="os-grid">
          <a class="os-card" href="https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases/latest/download/Divinity-win32-x64-0.1.0-setup.exe" id="dl-win">
            <span class="os-card__icon" aria-hidden="true">⊞</span>
            <span class="os-card__name">Windows</span>
            <span class="os-card__meta">.exe · Windows 10+</span>
          </a>
          <a class="os-card" href="https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases/latest/download/Divinity-darwin-arm64-0.1.0.dmg" id="dl-mac">
            <span class="os-card__icon" aria-hidden="true">◉</span>
            <span class="os-card__name">macOS</span>
            <span class="os-card__meta">.dmg · Apple Silicon</span>
          </a>
          <a class="os-card" href="https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases/latest/download/divinity-linux_0.1.0_amd64.deb" id="dl-linux">
            <span class="os-card__icon" aria-hidden="true">⛬</span>
            <span class="os-card__name">Linux</span>
            <span class="os-card__meta">.deb · x64</span>
          </a>
        </div>
        <p class="download__alt">
          All versions and release notes are on the
          <a href="https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases" target="_blank" rel="noopener">releases page</a>.
        </p>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer__inner">
      <span>© <span id="year"></span> Divinity Works</span>
      <span class="footer__links">
        <a href="https://github.com/ufuomazech62-cpu/divinityworks-desktop" target="_blank" rel="noopener">GitHub</a>
      </span>
    </div>
  </footer>

  <script>
    document.getElementById('year').textContent = new Date().getFullYear();
  </script>
</body>
</html>
`;
  page = page.split('<link rel="stylesheet" href="styles.css" />').join('<style>' + css + '</style>');
  return new Response(page, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
