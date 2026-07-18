addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

const RELEASE_BASE = 'https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases/download/v0.1.2';
const ASSET_BASE = 'https://raw.githubusercontent.com/ufuomazech62-cpu/divinityworks-desktop/main/assets';

// Map of OS -> installer filename in R2 (releases/v0.1.2/ prefix)
const INSTALLERS = {
  mac:    'Divinity-darwin-arm64-0.1.2.dmg',
  windows:'Divinity-win32-x64-0.1.2-setup.exe',
  linux:  'divinity-linux_0.1.2_amd64.deb',
};

async function handle(request) {
  const url = new URL(request.url);

  // One-click downloads: /download/<os> -> R2 object via BUCKET binding.
  // OS is auto-detected client-side and the button points to /download/<os>.
  if (url.pathname.startsWith('/download/')) {
    const key = url.pathname.replace('/download/', '');
    let objectKey;
    if (INSTALLERS[key]) {
      objectKey = 'releases/v0.1.2/' + INSTALLERS[key];
    } else if (Object.values(INSTALLERS).includes(key)) {
      objectKey = 'releases/v0.1.2/' + key;
    } else {
      return new Response('Not found', { status: 404 });
    }
    const object = await BUCKET.get(objectKey);
    if (!object) {
      return new Response('Not found', { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=3600');
    const file = objectKey.split('/').pop();
    headers.set('content-disposition', 'attachment; filename="' + file + '"');
    return new Response(object.body, { status: 200, headers });
  }

  // Serve static site assets (screenshots, og images) from the public GitHub
  // repo via a same-origin path. Edge-cached for a day so repeat visits are fast.
  if (url.pathname.startsWith('/s/')) {
    const file = url.pathname.replace('/s/', '');
    const upstream = ASSET_BASE + '/' + file;
    const r = await fetch(upstream, {
      headers: { 'User-Agent': 'DivinityWorks/1.0', 'Accept': '*/*' },
    });
    const headers = new Headers(r.headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=86400, immutable');
    return new Response(r.body, { status: r.status, headers });
  }

  // Serve brand icons (apple, windows, linux, lucide, simple-icons) from R2.
  if (url.pathname.startsWith('/i/')) {
    const file = url.pathname.replace('/i/', '');
    const objectKey = 'site/icons/' + file;
    const object = await BUCKET.get(objectKey);
    if (!object) {
      return new Response('Not found', { status: 404 });
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('access-control-allow-origin', '*');
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response(object.body, { status: 200, headers });
  }

  const css = `/*
  Divinity Works — landing v3. Sharp, sleek, smooth.
  Geist. Hairline borders. Pure white. High contrast text.
*/
:root {
  --bg: #ffffff;
  --bg-soft: #fafafa;
  --bg-deep: #0a0a0a;
  --card: #ffffff;
  --border: #ececef;
  --border-strong: #d4d4d8;
  --text: #0a0a0a;
  --muted: #525258;
  --muted-soft: #71717a;
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 14px;
  --maxw: 1120px;
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  font-family: "Geist", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  font-feature-settings: "ss01", "cv11";
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  letter-spacing: -0.012em;
  text-rendering: optimizeLegibility;
}
a { color: inherit; text-decoration: none; }
img, svg { display: block; max-width: 100%; }

/* ---------- Sections ---------- */
.section { padding: 96px 24px; }
.section__inner { max-width: var(--maxw); margin: 0 auto; }
.section__eyebrow {
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-soft);
  margin-bottom: 16px;
}
.section__title {
  text-align: center;
  font-size: clamp(30px, 4.4vw, 44px);
  font-weight: 600;
  letter-spacing: -0.038em;
  line-height: 1.05;
  margin-bottom: 16px;
}
.section__lede {
  text-align: center;
  max-width: 560px;
  margin: 0 auto 56px;
  color: var(--muted);
  font-size: 17px;
  letter-spacing: -0.012em;
  line-height: 1.55;
}

/* ---------- Nav ---------- */
.nav {
  position: sticky; top: 0; z-index: 30;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  border-bottom: 1px solid var(--border);
}
.nav__inner {
  max-width: var(--maxw); margin: 0 auto;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px;
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; letter-spacing: -0.02em; }
.brand__mark { display: block; width: 30px; height: 30px; border-radius: 7px; flex: none; }
.brand__sub { color: var(--muted); font-weight: 500; margin-left: 2px; }
.nav__links { display: flex; align-items: center; gap: 28px; font-size: 14px; color: var(--muted); }
.nav__links a { transition: color .15s var(--ease); }
.nav__links a:hover { color: var(--text); }
.nav__cta {
  background: #0a0a0a; color: #fff;
  padding: 7px 14px; border-radius: 7px;
  font-weight: 500; font-size: 13.5px;
  transition: opacity .15s var(--ease);
  cursor: pointer; border: none;
}
.nav__cta:hover { opacity: 0.85; color: #fff; }

/* ---------- Hero ---------- */
.hero {
  position: relative;
  overflow: hidden;
  padding: 96px 24px 0;
}
.hero__inner {
  max-width: var(--maxw); margin: 0 auto; text-align: center;
}
.hero__title {
  font-size: clamp(40px, 6.4vw, 72px);
  line-height: 1.0;
  font-weight: 700;
  letter-spacing: -0.045em;
  margin: 0 auto 24px;
  color: var(--text);
  max-width: 900px;
}
.hero__lede {
  max-width: 580px; margin: 0 auto 32px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.5;
  letter-spacing: -0.012em;
}
.hero__cta {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
  margin-bottom: 20px;
}
.hero__platforms {
  display: flex; align-items: center; justify-content: center; gap: 18px;
  margin-bottom: 72px;
  color: var(--muted-soft);
  font-size: 13px;
  letter-spacing: -0.005em;
}
.hero__platform {
  display: inline-flex; align-items: center; gap: 6px;
}
.hero__platform svg, .hero__platform img { width: 14px; height: 14px; opacity: 0.7; }
.hero__platform-sep { color: var(--border-strong); }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 22px;
  border-radius: 8px;
  font-weight: 500; font-size: 14.5px;
  letter-spacing: -0.012em;
  transition: background .15s var(--ease), opacity .15s var(--ease), border-color .15s var(--ease), color .15s var(--ease);
  cursor: pointer; border: 1px solid transparent;
  font-family: inherit;
}
.btn--primary { background: #0a0a0a; color: #fff; }
.btn--primary:hover { opacity: 0.85; }
.btn--ghost {
  border-color: var(--border-strong);
  color: var(--text);
  background: #fff;
}
.btn--ghost:hover { border-color: #0a0a0a; }

/* ---------- Hero screenshot (sharp frame, minimal shadow) ---------- */
.hero__shot {
  max-width: 1080px; margin: 0 auto;
  border-radius: var(--radius-lg);
  background: #fff;
  padding: 6px;
  border: 1px solid var(--border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.hero__shot img {
  width: 100%; height: auto; border-radius: 8px; display: block;
}

/* ---------- Integrations strip ---------- */
.integrations {
  padding: 56px 24px;
  border-top: 1px solid var(--border);
}
.integrations__inner {
  max-width: var(--maxw); margin: 0 auto;
  text-align: center;
}
.integrations__label {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-soft);
  margin-bottom: 24px;
}
.integrations__grid {
  display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
  gap: 32px;
}
.integrations__grid img, .integrations__grid svg {
  width: 22px; height: 22px;
  color: var(--muted-soft);
  opacity: 0.7;
  transition: opacity .15s var(--ease);
}
.integrations__grid > *:hover { opacity: 1; }

/* ---------- Surfaces ---------- */
.surfaces {
  padding: 96px 24px;
  border-top: 1px solid var(--border);
}
.surfaces__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: var(--maxw); margin: 0 auto;
}
.surface {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  display: flex; flex-direction: column; gap: 10px;
  transition: border-color .15s var(--ease);
}
.surface:hover { border-color: var(--border-strong); }
.surface__icon {
  width: 28px; height: 28px; border-radius: 6px;
  background: #0a0a0a; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
}
.surface__icon svg { width: 14px; height: 14px; }
.surface__name { font-size: 15px; font-weight: 600; letter-spacing: -0.02em; color: var(--text); }
.surface__desc { font-size: 13.5px; color: var(--muted); line-height: 1.5; }

/* ---------- Loop ---------- */
.how {
  padding: 96px 24px;
  border-top: 1px solid var(--border);
}
.how__grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 24px; max-width: var(--maxw); margin: 0 auto;
}
.step { padding: 4px; }
.step__num {
  font-size: 12px; font-weight: 500; color: var(--muted-soft);
  letter-spacing: 0.1em; margin-bottom: 14px;
  display: inline-flex; align-items: center; gap: 8px;
}
.step__num::before {
  content: ""; width: 16px; height: 1px; background: var(--border-strong);
}
.step__title { font-size: 17px; font-weight: 600; letter-spacing: -0.025em; margin-bottom: 8px; color: var(--text); }
.step__desc { font-size: 14px; color: var(--muted); line-height: 1.55; }

/* ---------- Why ---------- */
.why {
  padding: 96px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-soft);
}
.why__grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 16px 32px; max-width: 880px; margin: 0 auto;
}
.why__item {
  display: flex; gap: 14px; align-items: flex-start;
  padding: 6px 0;
}
.why__check {
  flex: none; width: 20px; height: 20px; border-radius: 50%;
  background: #0a0a0a; color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  margin-top: 2px;
}
.why__check svg { width: 11px; height: 11px; }
.why__text { font-size: 15.5px; line-height: 1.5; letter-spacing: -0.012em; color: var(--text); }
.why__text strong { font-weight: 600; display: block; margin-bottom: 2px; }
.why__text span { color: var(--muted); }

/* ---------- Talk (voice/video) ---------- */
.talk {
  padding: 96px 24px;
  border-top: 1px solid var(--border);
}
.talk__inner {
  max-width: var(--maxw); margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
}
.talk__content { text-align: left; }
.talk__content .section__eyebrow,
.talk__content .section__title,
.talk__content .section__lede {
  text-align: left;
  margin-left: 0;
}
.talk__content .section__title { font-size: clamp(28px, 3.8vw, 38px); }
.talk__content .section__lede { margin-bottom: 24px; }
.talk__bullets {
  list-style: none;
  margin-top: 16px;
}
.talk__bullets li {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 6px 0;
  font-size: 14.5px;
  color: var(--muted);
  line-height: 1.5;
}
.talk__bullets li::before {
  content: ""; flex: none;
  width: 6px; height: 6px; border-radius: 50%;
  background: #0a0a0a;
  margin-top: 8px;
}
.talk__visual {
  position: relative;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-lg);
  background: #0a0a0a;
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}
.talk__visual::before {
  content: ""; position: absolute; inset: 0;
  background:
    radial-gradient(circle at 50% 45%, rgba(255,255,255,0.06), transparent 60%);
}
.talk__avatar {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 96px; height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 1px solid rgba(255,255,255,0.08);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.talk__avatar svg { width: 36px; height: 36px; }
.talk__pulse {
  position: absolute; left: 50%; top: 50%;
  width: 96px; height: 96px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(255,255,255,0.18);
  animation: pulse 2.4s var(--ease) infinite;
}
.talk__pulse--2 { animation-delay: 0.8s; }
.talk__pulse--3 { animation-delay: 1.6s; }
@keyframes pulse {
  0%   { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
  100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
}
.talk__caption {
  position: absolute; left: 50%; bottom: 24px;
  transform: translateX(-50%);
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 980px;
  font-size: 12.5px;
  color: rgba(255,255,255,0.85);
  letter-spacing: -0.005em;
  white-space: nowrap;
}
.talk__caption-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 0 3px rgba(74,222,128,0.18);
}

/* ---------- Download ---------- */
.download {
  padding: 104px 24px;
  background: var(--bg-deep);
  color: #fff;
  text-align: center;
}
.download .section__eyebrow { color: rgba(255,255,255,0.5); }
.download .section__title { color: #fff; }
.download .section__lede { color: rgba(255,255,255,0.65); }
.download__detected {
  display: inline-flex; align-items: center; gap: 8px;
  margin: 0 auto 28px;
  padding: 8px 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 980px;
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  letter-spacing: -0.005em;
}
.download__detected svg, .download__detected img { width: 14px; height: 14px; }
.download__detected strong { font-weight: 600; color: #fff; }
.download__primary {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 14px 28px;
  background: #fff;
  color: #0a0a0a;
  border-radius: 980px;
  font-weight: 500; font-size: 15.5px;
  letter-spacing: -0.012em;
  transition: opacity .15s var(--ease), transform .15s var(--ease);
  cursor: pointer; border: none;
  font-family: inherit;
  margin-bottom: 16px;
}
.download__primary:hover { opacity: 0.9; transform: translateY(-1px); }
.download__primary svg, .download__primary img { width: 16px; height: 16px; }
.download__alt {
  font-size: 13px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 40px;
}
.download__alt a {
  color: rgba(255,255,255,0.8);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-color: rgba(255,255,255,0.2);
  transition: text-decoration-color .15s var(--ease);
}
.download__alt a:hover { text-decoration-color: rgba(255,255,255,0.6); }
.download__all-label {
  font-size: 11px; font-weight: 500;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: rgba(255,255,255,0.4);
  margin-bottom: 16px;
}
.os-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px; max-width: 680px; margin: 0 auto;
}
.os-card {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--radius);
  padding: 24px 16px; color: #fff;
  transition: border-color .15s var(--ease), background .15s var(--ease);
}
.os-card:hover {
  border-color: rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.06);
}
.os-card__icon {
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
}
.os-card__icon svg, .os-card__icon img { width: 100%; height: 100%; }
.os-card__name { font-size: 14px; font-weight: 500; letter-spacing: -0.01em; color: #fff; }
.os-card__meta { font-size: 11.5px; color: rgba(255,255,255,0.5); }
.download__platforms { margin-top: 28px; font-size: 12px; color: rgba(255,255,255,0.4); }

/* ---------- Footer ---------- */
.footer { border-top: 1px solid var(--border); background: #fff; }
.footer__inner {
  max-width: var(--maxw); margin: 0 auto; padding: 24px;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; color: var(--muted);
}
.brand--sm { font-size: 14px; }
.brand--sm .brand__mark { width: 24px; height: 24px; }
.footer__copy { color: var(--muted); }
.footer__links { display: flex; gap: 24px; }
.footer__links a:hover { color: var(--text); }

/* ---------- Responsive ---------- */
@media (max-width: 900px) {
  .surfaces__grid { grid-template-columns: repeat(2, 1fr); }
  .how__grid { grid-template-columns: repeat(2, 1fr); gap: 32px 20px; }
  .why__grid { grid-template-columns: 1fr; }
  .talk__inner { grid-template-columns: 1fr; gap: 32px; }
  .talk__visual { max-width: 480px; margin: 0 auto; }
}
@media (max-width: 600px) {
  .nav__links { gap: 14px; font-size: 13px; }
  .nav__links a:not(.nav__cta) { display: none; }
  .hero { padding-top: 64px; }
  .hero__shot { padding: 6px; border-radius: 10px; }
  .hero__shot img { border-radius: 6px; }
  .section, .surfaces, .how, .why, .talk, .download, .integrations { padding-top: 64px; padding-bottom: 64px; }
  .surfaces__grid, .how__grid, .os-grid { grid-template-columns: 1fr; }
  .hero__platforms { gap: 10px; }
  .footer__inner { flex-direction: column; gap: 14px; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation: none !important; }
}
`;
  let page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Divinity Works — Your AI Coworker With a Real Memory</title>
  <meta name="description" content="Divinity is your AI coworker with a real memory. It remembers your work, understands your projects, and helps you get things done across your computer, apps, and the web." />
  <meta property="og:title" content="Divinity Works — Your AI Coworker With a Real Memory" />
  <meta property="og:description" content="Your AI coworker with a real memory. It remembers your work, understands your projects, and helps you get things done across your computer, apps, and the web." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="data:image/png;base64,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" type="image/png" />
  <style id="inline-css"></style>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body>
  <header class="nav">
    <div class="nav__inner">
      <a class="brand" href="/" aria-label="Divinity Works">
        <img class="brand__mark" src="data:image/png;base64,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" alt="Divinity" />
        <span>Divinity<span class="brand__sub">Works</span></span>
      </a>
      <nav class="nav__links">
        <a href="#surfaces">What's inside</a>
        <a href="#how">How it works</a>
        <a href="#talk">Talk</a>
        <a href="#why">Why</a>
        <button class="nav__cta" id="nav-download" type="button">Download</button>
      </nav>
    </div>
  </header>

  <main>
    <!-- ===== HERO ===== -->
    <section class="hero">
      <div class="hero__inner">
        <h1 class="hero__title">Your AI coworker with a real memory.</h1>
        <p class="hero__lede">
          It remembers your work, understands your projects, and helps you get things done across your computer, apps, and the web.
        </p>
        <div class="hero__cta">
          <button class="btn btn--primary" id="hero-download" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download for <span id="hero-download-os">your device</span>
          </button>
          <a class="btn btn--ghost" href="#how">See it in action</a>
        </div>
        <div class="hero__platforms">
          <span class="hero__platform"><img src="/i/apple.svg" alt="" onerror="this.style.display='none'" /><span>Mac</span></span>
          <span class="hero__platform-sep">·</span>
          <span class="hero__platform"><img src="/i/windows.svg" alt="" onerror="this.style.display='none'" /><span>Windows</span></span>
          <span class="hero__platform-sep">·</span>
          <span class="hero__platform"><img src="/i/linux.svg" alt="" onerror="this.style.display='none'" /><span>Linux</span></span>
        </div>

        <div class="hero__shot" role="img" aria-label="Divinity Works desktop app">
          <img
            src="/s/hero-screenshot.webp"
            srcset="/s/hero-screenshot-small.webp 800w, /s/hero-screenshot-medium.webp 1280w, /s/hero-screenshot.webp 1920w"
            sizes="(max-width: 720px) 92vw, (max-width: 1080px) 88vw, 1040px"
            alt="Divinity Works desktop app"
            width="1920" height="1130" decoding="async" fetchpriority="high" />
        </div>
      </div>
    </section>

    <!-- ===== INTEGRATIONS ===== -->
    <section class="integrations">
      <div class="integrations__inner">
        <p class="integrations__label">Connects to the apps you already use</p>
        <div class="integrations__grid">
          <img src="/i/gmail.svg" alt="Gmail" />
          <img src="/i/googlecalendar.svg" alt="Google Calendar" />
          <img src="/i/googledrive.svg" alt="Google Drive" />
          <img src="/i/slack.svg" alt="Slack" />
          <img src="/i/notion.svg" alt="Notion" />
          <img src="/i/linear.svg" alt="Linear" />
          <img src="/i/github.svg" alt="GitHub" />
          <img src="/i/jira.svg" alt="Jira" />
          <img src="/i/discord.svg" alt="Discord" />
        </div>
      </div>
    </section>

    <!-- ===== SURFACES ===== -->
    <section id="surfaces" class="surfaces">
      <div class="section__inner">
        <p class="section__eyebrow">What's inside</p>
        <h2 class="section__title">Every surface, one workspace.</h2>
        <p class="section__lede">Divinity comes with the apps you use to work — all sharing the same memory.</p>
        <div class="surfaces__grid">
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="6.5" y1="6.5" x2="10.5" y2="10.5"/><line x1="17.5" y1="6.5" x2="13.5" y2="10.5"/><line x1="6.5" y1="17.5" x2="10.5" y2="13.5"/><line x1="17.5" y1="17.5" x2="13.5" y2="13.5"/></svg></span>
            <h3 class="surface__name">Brain</h3>
            <p class="surface__desc">A living knowledge graph of your work. Searchable, editable, plain Markdown.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
            <h3 class="surface__name">Email</h3>
            <p class="surface__desc">A built-in email client that sorts what matters and drafts replies with your context.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
            <h3 class="surface__name">Browser</h3>
            <p class="surface__desc">An isolated browser the assistant can drive. You log in only to what it should touch.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            <h3 class="surface__name">Code mode</h3>
            <p class="surface__desc">Spin up parallel coding agents with Claude Code or Codex, driven by your full context.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg></span>
            <h3 class="surface__name">Meeting notes</h3>
            <p class="surface__desc">Local transcription of mic and speakers, summarized into Markdown.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></span>
            <h3 class="surface__name">Apps</h3>
            <p class="surface__desc">Build your own apps inside Divinity. They get the same memory, tools, and integrations.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== LOOP ===== -->
    <section id="how" class="how">
      <div class="section__inner">
        <p class="section__eyebrow">How it works</p>
        <h2 class="section__title">How Divinity works.</h2>
        <p class="section__lede">It indexes your work into a living memory, then uses that memory to create, act, and get things done with you.</p>
        <div class="how__grid">
          <article class="step">
            <span class="step__num">01</span>
            <h3 class="step__title">Remembers</h3>
            <p class="step__desc">Your emails, meetings, files, and conversations are indexed into a living memory on your machine.</p>
          </article>
          <article class="step">
            <span class="step__num">02</span>
            <h3 class="step__title">Creates</h3>
            <p class="step__desc">Drafts emails, documents, decks, and research grounded in your real projects and context.</p>
          </article>
          <article class="step">
            <span class="step__num">03</span>
            <h3 class="step__title">Acts</h3>
            <p class="step__desc">Uses its own browser and tools to complete tasks across your apps, forms, and the web.</p>
          </article>
          <article class="step">
            <span class="step__num">04</span>
            <h3 class="step__title">Learns</h3>
            <p class="step__desc">Picks up your voice, your projects, and your way of working. Gets sharper the more you use it.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== TALK ===== -->
    <section id="talk" class="talk">
      <div class="talk__inner">
        <div class="talk__content">
          <p class="section__eyebrow">Talk</p>
          <h2 class="section__title">Talk to Divinity like a coworker.</h2>
          <p class="section__lede">Open a voice or video call with your AI. Speak naturally. Divinity listens, answers, and remembers the whole conversation.</p>
          <ul class="talk__bullets">
            <li>Voice and video, the way you'd call a coworker.</li>
            <li>Ask out loud. Get answers in real time.</li>
            <li>The conversation is indexed into your memory, like everything else.</li>
          </ul>
        </div>
        <div class="talk__visual" aria-hidden="true">
          <div class="talk__pulse"></div>
          <div class="talk__pulse talk__pulse--2"></div>
          <div class="talk__pulse talk__pulse--3"></div>
          <div class="talk__avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>
          <div class="talk__caption">
            <span class="talk__caption-dot"></span>
            Live with Divinity
          </div>
        </div>
      </div>
    </section>

    <!-- ===== WHY ===== -->
    <section id="why" class="why">
      <div class="section__inner">
        <p class="section__eyebrow">Why</p>
        <h2 class="section__title">Why Divinity.</h2>
        <div class="why__grid">
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>Real memory, not search.</strong><span>Your context accumulates. No cold starts, no re-explaining.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It acts, doesn't just answer.</strong><span>Drives a browser, drafts email, runs code, completes tasks.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>Yours, on your machine.</strong><span>Everything is plain Markdown you can read, edit, back up, or delete.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>Works in the background.</strong><span>Set agents on events or schedules. Wake up to work already done.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>Connects to your stack.</strong><span>Plug into Gmail, Calendar, Slack, GitHub, Notion, Linear, and more.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>Gets sharper over time.</strong><span>Learns your voice, your projects, your way of working.</span></p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== DOWNLOAD ===== -->
    <section id="download" class="download">
      <div class="section__inner">
        <p class="section__eyebrow">Get Divinity</p>
        <h2 class="section__title">Install Divinity.</h2>
        <p class="section__lede">Install once. Sign in once. Divinity starts learning your work and getting things done from day one.</p>

        <div class="download__detected" id="detected-pill">
          <span id="detected-icon"></span>
          Detected: <strong id="detected-name">your device</strong>
        </div>
        <div>
          <button class="download__primary" id="primary-download" type="button">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download for <span id="primary-download-os">your device</span>
          </button>
        </div>
        <p class="download__alt">
          On a different machine? <a href="#" id="alt-link">Browse all downloads</a>
        </p>

        <p class="download__all-label">All downloads</p>
        <div class="os-grid">
          <a class="os-card" href="/download/mac" data-os="mac">
            <span class="os-card__icon"><img src="/i/apple.svg" alt="" /></span>
            <span class="os-card__name">Mac</span>
            <span class="os-card__meta">.dmg · Apple Silicon</span>
          </a>
          <a class="os-card" href="/download/windows" data-os="windows">
            <span class="os-card__icon"><img src="/i/windows.svg" alt="" /></span>
            <span class="os-card__name">Windows</span>
            <span class="os-card__meta">.exe installer</span>
          </a>
          <a class="os-card" href="/download/linux" data-os="linux">
            <span class="os-card__icon"><img src="/i/linux.svg" alt="" /></span>
            <span class="os-card__name">Linux</span>
            <span class="os-card__meta">.deb · amd64</span>
          </a>
        </div>
        <p class="download__platforms">v0.1.2 · Also available for Linux ARM64 and Intel Mac</p>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer__inner">
      <a class="brand brand--sm" href="/" aria-label="Divinity Works">
        <img class="brand__mark" src="data:image/png;base64,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" alt="Divinity" />
        <span>Divinity<span class="brand__sub">Works</span></span>
      </a>
      <span class="footer__copy">© <span id="year"></span> Divinity Works</span>
      <nav class="footer__links">
        <a href="#surfaces">What's inside</a>
        <a href="#how">How it works</a>
        <a href="#talk">Talk</a>
        <a href="#download">Download</a>
      </nav>
    </div>
  </footer>

  <script>
    // One rule: clicking Download downloads. Immediately. No scroll, no toast,
    // no notes, no "Get the desktop app". Just download.
    // Detect the OS, default to Mac if unknown (or mobile), download that.
    (function() {
      function detectOS() {
        var ua = (navigator.userAgent || navigator.platform || '').toLowerCase();
        if (/windows/.test(ua)) return 'windows';
        if (/linux/.test(ua) && !/android/.test(ua)) return 'linux';
        if (/mac|iphone|ipad|ipod/.test(ua)) return 'mac';
        return 'mac'; // default — Mac is the most common for early adopters
      }

      var os = detectOS();
      var osLabels = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };
      var osIcons = { mac: '/i/apple.svg', windows: '/i/windows.svg', linux: '/i/linux.svg' };
      var osUrls = {
        mac: '/download/mac',
        windows: '/download/windows',
        linux: '/download/linux'
      };

      // Set the button labels and icons.
      ['hero-download-os', 'primary-download-os'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.textContent = osLabels[os];
      });
      ['hero-download', 'primary-download'].forEach(function(id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        var existing = btn.querySelector('img.os-icon');
        if (existing) existing.remove();
        var img = document.createElement('img');
        img.src = osIcons[os];
        img.alt = '';
        img.className = 'os-icon';
        img.style.cssText = 'width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:2px;';
        var span = btn.querySelector('span');
        if (span) btn.insertBefore(img, span);
      });

      // Detected pill in the download section.
      var detIcon = document.getElementById('detected-icon');
      if (detIcon) detIcon.innerHTML = '<img src="' + osIcons[os] + '" alt="" />';
      var detName = document.getElementById('detected-name');
      if (detName) detName.textContent = osLabels[os];

      // The download action. Every download button does exactly this.
      function download() {
        window.location.href = osUrls[os];
      }
      ['nav-download', 'hero-download', 'primary-download'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', download);
      });

      // The "On a different machine?" link opens a small inline OS picker
      // right next to the link. Never scrolls.
      var altLink = document.getElementById('alt-link');
      if (altLink) {
        altLink.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          var existing = document.getElementById('dw-picker');
          if (existing) { existing.remove(); return; }
          var p = document.createElement('div');
          p.id = 'dw-picker';
          p.style.cssText = [
            'position:absolute', 'background:#0a0a0a', 'color:#fff',
            'border-radius:10px', 'padding:6px', 'min-width:180px',
            'box-shadow:0 16px 40px rgba(0,0,0,0.28)',
            'z-index:1001', 'font-family:inherit'
          ].join(';');
          [
            { os: 'mac', label: 'Mac' },
            { os: 'windows', label: 'Windows' },
            { os: 'linux', label: 'Linux' }
          ].forEach(function(opt) {
            var a = document.createElement('a');
            a.href = osUrls[opt.os];
            a.style.cssText = [
              'display:flex', 'align-items:center', 'gap:10px',
              'padding:10px 12px', 'color:#fff', 'text-decoration:none',
              'border-radius:6px', 'font-size:14px', 'letter-spacing:-0.01em'
            ].join(';');
            a.innerHTML = '<img src="' + osIcons[opt.os] + '" alt="" style="width:14px;height:14px;" />' + opt.label;
            a.addEventListener('mouseenter', function() { a.style.background = 'rgba(255,255,255,0.08)'; });
            a.addEventListener('mouseleave', function() { a.style.background = 'transparent'; });
            p.appendChild(a);
          });
          var rect = altLink.getBoundingClientRect();
          p.style.left = rect.left + 'px';
          p.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
          document.body.appendChild(p);
          setTimeout(function() {
            document.addEventListener('click', function close(ev) {
              if (!p.contains(ev.target) && ev.target !== altLink) {
                p.remove();
                document.removeEventListener('click', close);
              }
            });
          }, 0);
        });
      }

      document.getElementById('year').textContent = new Date().getFullYear();
    })();
  </script>
</body>
</html>
`;
  page = page.replace('<style id="inline-css"></style>', '<style>' + css + '</style>');
  return new Response(page, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
    },
  });
}
