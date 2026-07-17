addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

const RELEASE_BASE = 'https://github.com/ufuomazech62-cpu/divinityworks-desktop/releases/download/v0.1.0';
const ASSET_BASE = 'https://raw.githubusercontent.com/ufuomazech62-cpu/divinityworks-desktop/main/assets';

// Map of OS -> installer filename in R2 (releases/v0.1.0/ prefix)
const INSTALLERS = {
  mac:    'Divinity-darwin-arm64-0.1.0.dmg',
  windows:'Divinity-win32-x64-0.1.0-setup.exe',
  linux:  'divinity-linux_0.1.0_amd64.deb',
};

async function handle(request) {
  const url = new URL(request.url);

  // One-click downloads: /download/<os> -> R2 object via BUCKET binding.
  // OS is auto-detected client-side and the button points to /download/<os>.
  if (url.pathname.startsWith('/download/')) {
    const key = url.pathname.replace('/download/', '');
    let objectKey;
    if (INSTALLERS[key]) {
      objectKey = 'releases/v0.1.0/' + INSTALLERS[key];
    } else if (Object.values(INSTALLERS).includes(key)) {
      objectKey = 'releases/v0.1.0/' + key;
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
.brand__mark { display: block; border-radius: 6px; }
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
  <title>Divinity Works — Stop Starting From Scratch</title>
  <meta name="description" content="Divinity is the AI coworker that already knows your work. It remembers your emails, meetings, files, and notes — then writes your replies, runs your research, and gets things done across every app." />
  <meta property="og:title" content="Divinity Works — Stop Starting From Scratch" />
  <meta property="og:description" content="The AI coworker that already knows your work. Remembers your emails, meetings, files, and notes. Drafts, researches, and acts across every app." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyAAAAMgCAYAAADbcAZoAAAACXBIWXMAAED1AABA9QHyYHNPAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48GgAAIABJREFUeJzs3Xd4lfX9//HXnYQMRsJI2CRhQyICIsgIWCEKMquCFhXEilDRirbaWEeL9atfhv4q1DIUikwZBYGEpSFWAQdaRVFUHIAgYGRVhmEk5/eHwFctI+Oc877PuZ+P6+KqVUief7Tiy8/nvo/j8/mE/+Y4Tryk1FM/6p/6z0RJ1X70o4okR1KUpEoGmQAAAAieQ5JOSvJJOiBp349+7JW0VdK2Uz+2+ny+QyaVLucwQCTHcVIltZfUUlKLUz+SDZMAAAAQ+rZL2nTqx/uS3vL5fNtMi1zAkwPEcZx0SVdK6iSpo6TatkUAAADwiF2S1p/68bLP59ts3BN0nhggjuPESeoh6epT/1nPtggAAACQJH0laZWklZJW+3y+7417Ai5sB4jjOLH64ZRjgKRfimc0AAAA4G7fS1ojaaGkRT6f74hxT0CE3QBxHCdN0mBJt0uqapwDAAAAlMZ3kuZJmuLz+d61jvGnsBggjuPESLpZ0m8kXWqcAwAAAPjT25ImS5rj8/mOWceUVUgPEMdxEiXdJum3kuoY5wAAAACBlC9pkqRnfD7fXuuY0grJAeI4Tg1JD0gaLinOOAcAAAAIpqP64URkjM/ny7eOKamQGiCO41TTD6cd90qKN84BAAAALB2RNE3SEz6f7xvrmOIKiQHiOE45SSMkPSopwTgHAAAAcJPDkp6S9L+h8IyI6weI4zh9JP1VUkPrFgAAAMDFPpf0oM/nW2gdcj6uHSCO49SW9Hf98BkeAAAAAIpnhaQ7fD7fV9YhZxNhHfBzzg+GSfpEjA8AAACgpHpK+thxnCzHcSKtY37OVScgjuOkSpolKcO2BAAAAAgLayUN8vl8261DTnPNCYjjOAMkvSvGBwAAAOAvnSV94DjOIOuQ08xPQBzHqShpiqQbTUMAAACA8DZLPzwbcsQywnSAOI7TWNJiSReZRQAAAADe8Ymka30+38dWAWZXsBzH6SfpbTE+AAAAgGBpJun1Ux91YcJkgDiOM1I/nHzwoYIAAABAcFWWtNRxnFEW3zyoV7BOvQZsgn74VHMAAAAAtqbph+dCTgTrGwZtgDiOU0HSPyX1CMo3BAAAAFAcKyQN8Pl8R4PxzYIyQE696WqZpCsC/s0AAAAAlNQ6Sb18Pt93gf5GAR8gjuNUkbRS0mUB/UYAAAAAyuLfknr4fL69gfwmAR0gjuNUk5Qn6eKAfRMAAAAA/vK+pK4+n29/oL5BwN6C5ThOvH44+WB8AAAAAKGhpaRcx3EqB+obBGSAOI5TXlK2pLaB+PoAAAAAAqa1pOWnXiLld34fII7jRElaJKmLv782AAAAgKDoKGn+qY/R8KtAnICMF6/aBQAAAEJdL0mT/P1F/TpAHMd5QHzIIAAAABAubncc5/f+/IJ+ewuW4zi/lLRYkuOXLwgAAADADYok9fP5fDn++GJ+GSCO4zSRtEFSQpm/GAAAAAC3OSSpnc/n+6SsX6jMV7BOfcr5YjE+AAAAgHBVSdICf7wZyx/PgEyRlO6HrwMAAADAvVpImljWL1KmAeI4ziBJN5Y1AgAAAEBIGOw4zsCyfIFSPwPiOE59SRslxZclAAAAAEBIOSiplc/n216aX1yqExDHcSIkzRTjAwAAAPCaypJmnNoEJVbaK1h3Scoo5a8FAAAAENoulzS8NL+wxFewHMdJlvShfngSHgAAAIA3fScp3efz7SzJLyrNCchkMT4AAAAAr4uX9ExJf1GJBojjONdKurqk3wQAAABAWOrnOE6vkvyCYl/BchwnWj9cvWpcijAAAAAA4elzSRf5fL5jxfnJJTkBuVeMDwAAAAA/1UjSiOL+5GKdgDiOkyjpC/HaXQAAAAD/7aCkhj6fb/+FfmJxT0D+IMYHAAAAgLOrLOn3xfmJFzwBcRynpn44/Shf9i4AAAAAYeqIpAY+ny//fD+pOCcgD4jxAQAAAOD8Kki670I/6bwnII7jJEnaLinOf10AAAAAwtRRSck+n2/fuX7ChU5ARojxAQAAAKB4yksafr6fcM4TEMdxYiRtk1TT71kAAAAAwtU3klJ9Pl/B2f7i+U5AbhbjAwAAAEDJ1JA08Fx/8XwD5A7/twAAAADwgN+c6y+c9QqW4zgtJW0MZBEAAACAsNba5/P916Y41wnIORcLAAAAABTDrWf7k/91AuI4Tpyk3ZISghAFAAAAIDwdkFTL5/Md+/GfPNsJSE8xPgAAAACUTRVJV/38T55tgAwIfAsAAAAAD7j+53/iJ1ewHMcprx/e21sxiFEAAAAAwtMhSTV8Pt/3p//Ez09AuovxAQAAAMA/KknK/PGf+PkAuTp4LQAAAAA8oMeP/8vPr2Btl5Qc7CIAAAAAYWurz+drcPq/nDkBcRznIjE+AAAAAPhXfcdxmpz+Lz++gpV5lp8MAAAAAGV15ek/+PEAyTAIAQAAABD+zmyNM8+AOI6zS1ItqyIAAAAAYetrn89XVzp1AuI4TgMxPgAAAAAERh3HcZKl/7uC1c4wBgAAAED4ay/93wBpaRgCAAAAIPxdLP3fALnYMAQAAABA+Gsh/d8AaWEYAgAAACD8XSxJjqR4SQdP/TEAAAAABIJPUnyEpPpifAAAAAAILEdS6ukBAgAAAACBlhohKdW6AgAAAIAnpEZISrauAAAAAOAJqRGSqltXAAAAAPCEpAhJidYVAAAAADwhMUJSNesKAAAAAJ5QLUJSVesKAAAAAJ5QLUJSResKAAAAAJ5QIUJStHUFAAAAAE+IYYAAAAAACJYYR9JJSZHWJQAAAADC3glHks+6AgAAAIA3RFgHAAAAAPAOBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAgaBggAAACAoGGAAAAAAAiaKOsAAAAAeEtcXJzq1aun2rVrq169emf++KuvvtLYsWOt8xBgDBAAAAD4Tbly5VSvXj2lpKQoOTlZycnJqlOnjurUqXPmj6tVq3bWXztx4sQg18ICAwQAAADFFh0drbp166p27dqqVauWGjRo8JMfycnJiooq3T9i7tixw8+1cCMGCAAAAH6icuXKatSo0U9+NG7cWPXr11etWrUC9n137twZsK8N92CAAAAAeFCVKlX+6/Tixz8scALiDQwQAACAMHWukZGenh7Qk4zS4gTEGxxJPusIAAAAlE7FihXVvHlzpaWlqXHjxj+5NpWQkGCdV2w+n0/ly5dXQUGBdQoCjBMQAACAEBATE6NGjRopLS1N6enpZ/6zWbNmiogI/Y92+/bbbxkfHsEAAQAAcJFwHxrnwvUr72CAAAAAGPDq0DgXBoh3MEAAAAACKDo6Wunp6WrVqpXS0tJ00UUXqXnz5kpJSbFOcxUGiHcwQAAAAPykYsWKatq0qdLT09WmTZszP2JjY63TXI9X8HoHAwQAAKAUkpKS1Lp165/8aNSokSevT/nD119/bZ2AIGGAAAAAXEDt2rXPnGacflajefPmchzHOi1sbN++3ToBQcIAAQAAOCUyMlIpKSk/uULVrl07Va9e3Tot7G3bts06AUHCBxECAADPSklJUfv27XXZZZfpsssuU6tWrVS+fHnrLM85efKk4uLidPLkSesUBAEnIAAAwBMqVqyoVq1anTnZ6Ny5s1JTU62zoB/egMX48A4GCAAACEsNGjRQRkbGT65SlStXzjoLZ8H1K29hgAAAgJCXkJCgtm3bnhkcHTt2VNWqVa2zUEw8gO4tDBAAABBSoqKi1LRpU3Xq1OnM4OCNVKGNExBvYYAAAABXS0hIUEZGhrp06aLOnTurTZs2io6Ots6CH3EC4i0MEAAA4CpJSUlq3779mRMOnt0If5yAeAsDBAAAmKpZs6Y6d+6sjIwMderUSZdccgnXqTyGExBv4XNAAABAUNWuXVudOnVSZmamMjIylJaWZp0EQ4WFhYqLi9OJEyesUxAknIAAAICAOv063E6dOql79+5KSUmxToKL7Nq1i/HhMQwQAADgN47jqEWLFuratasuv/xyZWRkKDEx0ToLLsbzH97DAAEAAGVSo0YNdenSRZmZmerZs6fq1q1rnYQQ8sUXX1gnIMgYIAAAoEQqVKigDh06KDMzU5mZmTw0jjL58ssvrRMQZAwQAABwXpGRkWrVqtWZwdGlSxc+hwN+wwmI9zBAAADAf2nQoMGZwZGZmakqVapYJyFMMUC8hwECAACUmJioK664QpmZmbypCkHFFSzv4XNAAADwoOjoaHXu3Fndu3fXlVdeqZYtW/IcB4Lu0KFDio+Pt85AkHECAgCAR5w+5ejTp4/69u2rhIQE6yR4HNevvIkBAgBAGEtPT1fv3r3Vp08fdejQQREREdZJwBkMEG9igAAAEEbKly+vjh07qk+fPrr22mv5TA64Gs9/eBMDBACAEFe/fn1deeWV6tOnj6688krFxMRYJwHFwgmINzFAAAAIMac/l6NPnz7q3bu32rRpY50ElAonIN7EAAEAIAQkJibq6quvVq9evdS9e3dVrlzZOgkoM05AvInX8AIA4FIpKSm65pprdM0116hTp06KjIy0TgL85vjx4ypfvrwKCwutUxBknIAAAOAi9evXV9++fTVgwAB17NiRz+ZA2Priiy8YHx7FAAEAwFh6eroGDBjA8xzwlC1btlgnwAgDBACAIIuIiFDr1q3Vp08fDRw4UE2aNLFOAoKOAeJdDBAAAIIgMjJSHTp00IABA3TdddepTp061kmAqc8++8w6AUYYIAAABEhsbKwyMjLUp08f3XDDDapRo4Z1EuAanIB4FwMEAAA/qlixonr27KnrrrtOV199tSpVqmSdBLgSJyDexWt4AQAoo5iYGF111VUaMGCArrnmGlWsWNE6CXC1w4cPKz4+Xj4f/xjqRZyAAABQChEREerYsaMGDBigG2+8UYmJidZJQMjYsmUL48PDGCAAAJRAenq6Bg0apMGDB6tWrVrWOUBI4vqVtzFAAAC4gNOf03HjjTeqcePG1jlAyOMBdG9jgAAAcBYNGjTQwIEDNXDgQKWnp1vnAGGFExBvY4AAAHBKtWrVdN1112nw4MHq2LGjHMexTgLC0scff2ydAEO8BQsA4GmVK1dW3759NWDAAPXo0UNRUfy7OSCQfD6fEhISdOjQIesUGOHvsgAAzylXrpyuvvpqDRkyRL169VJ0dLR1EuAZO3fuZHx4HAMEAOAZaWlpGjx4sIYMGcKnkgNGNm/ebJ0AYwwQAEBYq1y5sq6//noNHjxYnTp1ss4BPI/nP8AAAQCEncjISF1xxRUaPHiw+vfvr7i4OOskAKcwQMAAAQCEjebNm+uWW27RLbfcopo1a1rnADgLBggYIACAkMYVKyC0MEDAAAEAhByuWAGhad++fdq7d691BowxQAAAISM9PV233nqrbrrpJq5YASGIN2BBYoAAAFwuJiZGffv21bBhw9StWzc+nRwIYVy/gsQAAQC4VNOmTTVs2DDdcsstqlatmnUOAD9ggEBigAAAXCQ6Olr9+vXjtAMIUx9++KF1AlyAAQIAMNewYUPdfvvtuvXWW1W9enXrHAABwgCBJDmSfNYRAADvOf0mq2HDhunaa69VZGSkdRKAANq7d6+SkpKsM+ACnIAAAIKqTp06uvnmm3XnnXeqXr161jkAgoTTD5zGAAEABFxERIS6du2qYcOG6ZprrlFUFL/9AF7DAMFp/A4AAAiYOnXqaOjQoRo6dKjq1q1rnQPAEAMEpzFAAAB+16ZNG40cOVK/+tWvVK5cOescAC7AAMFpPIQOAPCL06/Qveeee9SxY0frHAAuU6VKFR08eNA6Ay7ACQgAoEyqV6+uW2+9VXfddRfXrACc1Y4dOxgfOIMBAgAolUsuuUTDhw/XoEGDFBcXZ50DwMW4foUfY4AAAIotMjJSPXv21N13363MzEzrHAAhYtOmTdYJcBEGCADgghITEzVs2DCNGDFCderUsc4BEGI++ugj6wS4CAMEAHBOzZo10x133KGhQ4eqfPny1jkAQtS7775rnQAX4S1YAICfiIiIUK9evXT33XerW7duchzHOglACCsoKFB8fLxOnDhhnQKX4AQEACBJqlChgm677Tbde++9Sk1Ntc4BECY+/PBDxgd+ggECAB6XlJSkO++8U3fddZeqVatmnQMgzHD9Cj/HAAEAj6pfv77uuecenu8AEFDvvfeedQJchgECAB7TqlUr/e53v9PAgQMVFcVvAwACiwGCn+MhdADwiIyMDGVlZal3797WKQA8orCwUPHx8Tp69Kh1ClyEf/UFAGHs9ButHnnkEbVt29Y6B4DHfPrpp4wP/BcGCACEoQoVKuimm27Sfffdp8aNG1vnAPAorl/hbBggABBGeKMVADdhgOBsGCAAEAYaNmyo3//+9xoyZIji4uKscwBAkrRx40brBLgQD6EDQAhr0KCBsrKy9Otf/5o3WgFwnaSkJO3du9c6Ay7D71YAEILS09OVlZWlG2+8UZGRkdY5APBftm/fzvjAWTFAACCEtGjRQvfffz/DA4Dr8fwHzoUBAgAhoGXLlnrooYfUv39/OY5jnQMAF8QAwbkwQADAxVq1aqUHH3yQ4QEg5DBAcC4MEABwoU6dOumBBx7gU8sBhCwGCM6Ft2ABgItkZGQoKyuL4QEgpO3bt0+JiYnWGXApTkAAwAUyMjL06KOPqmvXrtYpAFBm7777rnUCXIwBAgCGevXqpYcffljt27e3TgEAv+EDCHE+DBAAMJCRkaHHH39cXbp0sU4BAL/jBATnwwABgCC67LLL9Pjjj6tbt27WKQAQMDyAjvPhIXQACIL09HT9+c9/5nW6AMLekSNHFB8fr6KiIusUuBQnIAAQQE2aNNGjjz6q66+/XhEREdY5ABBw7733HuMD58UAAYAAqFu3rh555BH9+te/VlQUf6sF4B1vvPGGdQJcjt8VAcCPEhMTdd9992nkyJGKjY21zgGAoHvrrbesE+ByDBAA8INKlSppxIgRevDBBxUfH2+dAwBmGCC4EB5CB4AyqFChgu666y5lZWWpSpUq1jkAYGrXrl2qU6eOdQZcjhMQACiF6OhoDRkyRKNGjVKtWrWscwDAFXj+A8XBAAGAEoiIiNCgQYP0l7/8RcnJydY5AOAqGzZssE5ACGCAAEAxdevWTePGjVPr1q2tUwDAlTgBQXHwDAgAXECzZs30l7/8RQMGDLBOAQDXOnnypCpXrqwjR45Yp8DlOAEBgHNITEzUI488ohEjRvBZHgBwAR988AHjA8XC76gA8DPly5fXb3/7W16pCwAlwOt3UVwMEAA4JSIiQjfffLNGjx7Nm60AoIQYICguBggASMrMzNRTTz2liy++2DoFAELSm2++aZ2AEMFD6AA8LT09XWPHjlXPnj2tUwAgZB08eFDVqlVTUVGRdQpCQIR1AABYqFu3rqZMmaL333+f8QEAZfTmm28yPlBsXMEC4CkJCQl64IEHNHLkSMXFxVnnAEBY4AMIURIMEACe4DiOBg0apLFjx6pGjRrWOQAQVnj+AyXBMyAAwt6ll16qCRMmqEOHDtYpABB2fD6fkpKStG/fPusUhAieAQEQtmrWrKkpU6borbfeYnwAQIB89tlnjA+UCFewAISdcuXKacSIEfrLX/7CBwkCQIDx+R8oKQYIgLDSrVs3jR8/Xunp6dYpAOAJDBCUFFewAISFRo0aacGCBcrNzWV8AEAQ8QA6SoqH0AGEtPLly+sPf/iDsrKyFBsba50DAJ5SUFCg+Ph4nThxwjoFIYQrWABCkuM4uvHGGzVmzBjVqVPHOgcAPOntt99mfKDEGCAAQk7r1q01YcIEZWRkWKcAgKe9+uqr1gkIQTwDAiBkJCYmasqUKXrnnXcYHwDgAmvXrrVOQAjiGRAArnf6U8yffPJJJSUlWecAACSdPHlSVatW1aFDh6xTEGK4ggXA1Zo0aaKJEyeqW7du1ikAgB959913GR8oFa5gAXCluLg4jRo1Sh988AHjAwBc6LXXXrNOQIjiBASA6/Ts2VPPPPOM6tevb50CADgHnv9AafEMCADXqFWrlsaMGaNBgwZZpwAAzsPn8ykpKUn79u2zTkEI4gQEgLmIiAgNHTpU48aNU3x8vHUOAOACNm3axPhAqTFAAJhq3bq1Jk+erHbt2lmnAACKic//QFnwEDoAEwkJCRo/frzefvttxgcAhBie/0BZ8AwIgKDr06eP/v73v6tevXrWKQCAUqhdu7Z2795tnYEQxQkIgKBp2LChVq5cqWXLljE+ACBEbdmyhfGBMmGAAAi4iIgIDRs2TBs3blSPHj2scwAAZcDzHygrHkIHEFDp6emaNm2aLrvsMusUAIAf8PwHyooTEAABERUVpaysLP373/9mfABAGOET0FFWnIAA8LuLL75Y06ZN06WXXmqdAgDwo23btmn79u3WGQhxnIAA8Jty5copKytLb7/9NuMDAMIQpx/wB05AAPhF+/btNW3aNKWlpVmnAAAChOc/4A+cgAAok7i4OI0ePVrr1q1jfABAmOMEBP7ABxECKLWMjAxNmzZNTZo0sU4BAATYnj17VKtWLesMhAFOQACUWHx8vMaPH69XX32V8QEAHsHpB/yFZ0AAlEjPnj01efJkPskcADyG5z/gL5yAACiWhIQEPf/881q+fDnjAwA8KC8vzzoBYYJnQABcUKdOnTRjxgw1bNjQOgUAYODrr79W3bp1rTMQJjgBAXBOsbGxGj16tF577TXGBwB42Msvv2ydgDDCMyAAzqpFixaaNWuWWrZsaZ0CADCWm5trnYAwwgkIgJ+IiopSVlaW3nnnHcYHAEA+n4/nP+BXnIAAOKN+/fqaMWOGOnfubJ0CAHCJTZs2affu3dYZCCOcgACQ4zgaNmyYPvjgA8YHAOAneP4D/sYJCOBxNWvW1HPPPafevXtbpwAAXIjnP+BvvIYX8LABAwZo0qRJqlatmnUKAMCFjh8/rqpVq+rIkSPWKQgjXMECPCghIUEzZ87UggULGB8AgHNav3494wN+xxUswGO6d++uf/zjH6pdu7Z1CgDA5bh+hUDgBATwiHLlymnUqFFasWIF4wMAUCw8gI5A4BkQwAPq16+vuXPnqn379tYpAIAQceDAASUlJamwsNA6BWGGExAgzA0ePFgffPAB4wMAUCJr1qxhfCAgeAYECFOVKlXSxIkTdfPNN1unAABCENevECgMECAMXXrppXrhhRfUqFEj6xQAQIjiAXQEClewgDDiOI5Gjhyp9evXMz4AAKW2bds2ffnll9YZCFOcgABhIikpSc8//7x69uxpnQIACHGrV6+2TkAYY4AAYaBbt26aNWuWatWqZZ0CAAgDPP+BQOIKFhDCoqKiNGrUKL300kuMDwCAXxQWFuqVV16xzkAY4wQECFGpqamaM2eOOnbsaJ0CAAgj7777rvbv32+dgTDGCQgQgm688Ua9//77jA8AgN9x/QqBxgABQkhMTIwmTpyoOXPmKD4+3joHABCGeAAdgeZI8llHALiwevXqacGCBXyiOQAgYA4cOKDq1avr5MmT1ikIY5yAACGgZ8+e2rhxI+MDABBQq1atYnwg4BgggIs5jqOsrCxlZ2eratWq1jkAgDC3fPly6wR4AFewAJdKTEzUnDlzdNVVV1mnAAA8oLCwUDVr1tTevXutUxDmeA0v4EJt27bVwoULlZKSYp0CAPCIN998k/GBoOAKFuAyw4YN07p16xgfAICg4voVgoUTEMAlKlWqpKlTp+r666+3TgEAeBADBMHCMyCACzRr1kyLFi1SWlqadQoAwIN27NihlJQU+Xz8YyECjytYgLGbb75Z77zzDuMDAGAmJyeH8YGgYYAARmJiYjRlyhTNmjVLFSpUsM4BAHjYypUrrRPgIVzBAgwkJSVp4cKFuvzyy61TAAAe9/333ysxMVFHjx61ToFH8BA6EGStW7fWkiVLlJycbJ0CAIDy8vIYHwgqrmABQTRw4ECtX7+e8QEAcA3efoVgY4AAQRAZGanRo0dr7ty5iouLs84BAOAMnv9AsHEFCwiwqlWrat68ebryyiutUwAA+IlNmzZp27Zt1hnwGAYIEEBNmzbV0qVL1bRpU+sUAAD+C9evYIErWECA9OrVS2+99RbjAwDgWgwQWGCAAH7mOI6ysrK0bNkyJSQkWOcAAHBW+/fv15tvvmmdAQ/iChbgRxUrVtSMGTN07bXXWqcAAHBeq1at0smTJ60z4EEMEMBPGjZsqCVLluiiiy6yTgEA4IK4fgUrfBI64AeZmZmaP3++qlatap0CAMAFFRYWqkaNGtq3b591CjyIZ0CAMrrtttu0YsUKxgcAIGS89tprjA+YYYAApeQ4jkaNGqWpU6eqXLly1jkAABTb4sWLrRPgYVzBAkohNjZWzz//vG644QbrFAAASsTn8yklJUU7duywToFH8RA6UEK1atXS0qVL1bZtW+sUAABK7K233mJ8wBQDBCiBFi1aKDs7WykpKdYpAACUyosvvmidAI/jGRCgmK666iqtXbuW8QEACGlLliyxToDHMUCAYhg2bJiWL1/OJ5sDAELa+++/ry1btlhnwOMYIMB5REZGavTo0ZoyZYqiorixCAAIbVy/ghvwT1TAOVSsWFFz5sxR3759rVMAAPCLRYsWWScAvIYXOJvatWtr2bJlatMOUh4bAAAgAElEQVSmjXUKAAB+8dlnn6lJkybWGQBXsICfu+SSS7RhwwbGBwAgrPDhg3ALBgjwI127dtUrr7yiOnXqWKcAAOBXXL+CW3AFCzjlpptu0j/+8Q9FR0dbpwAA4Fc7d+5UcnKyfD7+sQ/2OAEBJN19992aOXMm4wMAEJYWLVrE+IBrMEDgaY7jaNSoURo/frwiIvi/AwAgPPH6XbgJV7DgWVFRUZo8ebJuu+026xQAAAJm7969qlWrlk6ePGmdAkjic0DgURUqVNDChQt19dVXW6cAABBQixcvZnzAVRgg8JyqVasqOztbHTt2tE4BACDguH4Ft+EKFjwlNTVVq1atUtOmTa1TAAAIuIMHD6pGjRo6fvy4dQpwBk/dwjMuuugirV27lvEBAPCM7OxsxgdchwECT/jFL36hdevWqW7dutYpAAAEDdev4EZcwULY69+/v2bPnq2YmBjrFAAAgubw4cOqUaOGjh49ap0C/AQnIAhrw4cP1/z58xkfAADPWbp0KeMDrsQAQdi66667NGnSJD5gEADgSXPnzrVOAM6KK1gIS1lZWRo9erR1BgAAJvbv369atWrxADpcic8BQVhxHEdjx47VfffdZ50CAICZBQsWMD7gWgwQhA3HcfT000/r7rvvtk4BAMDUCy+8YJ0AnBNXsBAWIiMj9dxzz+nWW2+1TgEAwNSuXbtUr149FRUVWacAZ8UJCEJedHS05syZo/79+1unAABg7oUXXmB8wNUYIAhpMTExmj9/vvr162edAgCAK3D9Cm7HFSyErAoVKmjJkiXKzMy0TgEAwBU+//xzNW7c2DoDOC9OQBCSKleurBUrVqhDhw7WKfiZTz/9VCtXrtTKlSt1+PBhZWZm6sorr1T79u0VFcXfcgAgkPjsD4QCTkAQcqpWrapVq1apbdu21imQdPToUb3++uvKzc3V0qVL9cknn5z151WoUEEdOnRQZmamMjMz1aZNmyCXAkD4S09P1+bNm60zgPNigCCk1K5dWy+//LLS0tKsUzxt8+bNWrlypVatWqW1a9fq2LFjJf4aKSkp6t69u3r27KnMzExVqFAhAKUA4B0bN25U69atrTOAC2KAIGTUqFFDeXl5jA8Dp085cnJytGTJEm3fvt2vXz8qKkrt27dX79691bdvXzVv3tyvXx8AvOAPf/iDxo0bZ50BXBADBCGhZs2aeuWVV9SsWTPrFM/49NNPlZOToxUrVmjdunVB/UTdZs2aqXfv3urdu7cyMjIUGRkZtO8NAKHI5/MpNTVVX331lXUKcEEMELhe9erVlZeXp/T0dOuUsFZYWKg333xT2dnZys7Ods0d4qpVq54ZI1dffbUqVqxonQQArrN27Vp16dLFOgMoFgYIXC0pKUl5eXm66KKLrFPC0t69e/XKK68oJydHS5cu1X/+8x/rpPOKi4tTZmamevfurV/+8peqXr26dRIAuMKIESM0adIk6wygWBggcK2kpCStWbNGLVq0sE4JK5s3b1Z2drZyc3P1r3/9SydPnrROKpXIyEh16NBBAwYM0MCBA5WUlGSdBAAmTp48qTp16ig/P986BSgWBghcifHhPwUFBcrLy9OyZcu0fPly7dy50zrJ76Kjo3XVVVdpwIAB6tevnxISEqyTACBoVq9erR49elhnAMXGAIHrJCYmas2aNbr44outU0LW/v37tWLFCi1dulSrVq3S4cOHrZOCJiYmRt27d9dNN92kvn37KjY21joJAAJqyJAhmjFjhnUGUGwMELhK5cqVlZuby4fUlcL27du1evVq5eTkaPXq1UF9a5VbJSQkqF+/fho0aJC6desmx3GskwDArwoKClSzZk3XP8MH/BgDBK5RuXJlvfzyy7r00kutU0LG6ec5cnJytH79evl8/N/5XJKTkzVw4EDdfvvtatiwoXUOAPjF/Pnz9atf/co6AygRBghcoUqVKsrNzdUll1xineJqhYWFWrdunRYtWqQlS5Zox44d1kkhJyIiQl26dNEtt9yi6667TpUqVbJOAoBS69mzp1auXGmdAZQIAwTmEhIS9NJLL6ldu3bWKa50+vM5Fi5cqAULFmj37t3WSWEjNjZWffr00eDBg9WjRw9FRUVZJwFAse3atUvJyckqLCy0TgFKhAECU5UqVVJubi7j42eOHTuml19+WYsXL9bSpUu1f/9+66SwV7duXd1yyy0aNmyYkpOTrXMA4ILGjBmjBx54wDoDKDEGCMzExcVpxYoV+sUvfmGd4grff/+9Vq5cqUWLFiknJ0ffffeddZInRUZGqk+fPhoxYoQyMzN5cB2Aa6Wlpenjjz+2zgBKjAECE+XKldPixYvVu3dv6xRTp086Fi5cqBdffFGHDh2yTsKPNGrUSEOHDtXQoUNVrVo16xwAOOPNN99Uhw4drDOAUmGAIOgiIiI0e/ZsDRw40DrFxI+f6ZgzZ4727t1rnYQLiI2N1fXXX697771XrVq1ss4BAN1xxx2aPHmydQZQKgwQBJXjOJo4caJ+85vfWKcEVVFRkd544w0tXLhQ8+bN0zfffGOdhFJq06aNhg0bpkGDBikuLs46B4AHFRQUqHbt2jpw4IB1ClAqDBAE1ejRo5WVlWWdETQbNmzQnDlztGDBAu3Zs8c6B35Uo0YN3X777brrrrtUo0YN6xwAHjJv3jzP3iJAeGCAIGgefPBBPf7449YZAbdjxw7NnTtX06dP16effmqdgwCLiYnRDTfcoAcffFBNmza1zgHgAT169NDq1autM4BSY4AgKO644w5NnDjROiNgDh48qOzsbM2cOVNr1qzhE8k9KCIiQr169dJDDz2kyy67zDoHQJj6+uuvlZKSwmd/IKRFWAcg/N1000165plnrDP87vjx43rxxRd17bXXqmbNmho8eLByc3MZHx5VVFSk7OxstW/fXldddZXWrFljnQQgDM2aNYvxgZDHCQgCqk+fPlq0aJHKlStnneI3mzdv1syZMzV9+nTl5+db58DFWrVqpd/97ncaOHAgn7IOwC+aN2+uTz75xDoDKBMGCAKma9euWr58uWJjY61Tymz//v1nnut49913rXMQYho1aqQ//OEPGjJkSFiNcQDB9cYbb6hjx47WGUCZMUAQEO3atVNubq4qVapknVJqhYWFevnllzV9+nQtXbpUx44ds05CiGvQoIH+9Kc/6eabb1ZkZKR1DoAQ85vf/EZTpkyxzgDKjAECv2vSpInWr1+vxMRE65RS+frrrzV16lRNmzZNO3bssM5BGGrWrJkeffRR9e/fXxERPIoH4MK+//571a5dWwcPHrROAcqMAQK/SkxM1Ouvv67GjRtbp5RIUVGR8vLy9Oyzz+rFF1/UyZMnrZPgAenp6frzn/+s/v37y3Ec6xwALjZ37lzddNNN1hmAXzBA4Dfly5fXmjVr1L59e+uUYtuzZ49mzJihKVOmaOvWrdY58Kh27drpkUceUe/eva1TALhU9+7d9dJLL1lnAH7BAIFfREVFacmSJerVq5d1ygX5fD7l5eXp73//u7KzszntgGt06dJFTzzxhDp16mSdAsBFdu7cqdTUVF6/i7DB5WP4xfjx410/PgoKCjRr1iy1bNlSmZmZXLWC67z22mvKyMhQ37599eWXX1rnAHCJmTNnMj4QVjgBQZk9/PDDeuyxx6wzzmnr1q2aOHGipk2bpgMHDljnAMUSGxure++9V3/84x9D+m1yAMrG5/OpadOm+uyzz6xTAL9hgKBMbrzxRs2ePduVD9CuX79e48eP56QDIS0xMVGPPPKI7rzzTl7dC3hQXl6eunXrZp0B+BUDBKV2xRVXaNWqVYqOjrZOOaOgoEALFy7UuHHjtGnTJuscwG/S0tL01FNPqUePHtYpAILohhtu0IIFC6wzAL9igKBUWrVqpddee801V0O+/PLLM9eseEc6wtm1116rp556SqmpqdYpAAIsPz9f9erV0/Hjx61TAL/iIXSUWN26dZWdne2K8bF+/Xpdf/31atq0qZ566inGB8Le4sWLlZaWpkcffZR/KAHC3D/+8Q/+f46wxAkISqRKlSpat26d0tLSzBqOHTum2bNn669//as++ugjsw7AWsuWLTVlyhRddtll1ikA/KyoqEiNGzfmjXgIS5yAoNhiYmK0ZMkSs/Fx4MABPfHEE0pNTdXQoUMZH/C8999/Xx07dtSdd96p//znP9Y5APwoNzeX8YGwxQBBsf3tb39Tly5dgv59t23bpgceeED169fXQw89pD179gS9AXCroqIiTZw4Uc2aNdOsWbOscwD4yZQpU6wTgIDhChaK5b777tO4ceOC+j3feecdPfnkk1q0aBGv0QWKqVevXnr22WdVu3Zt6xQApbR7926lpKToxIkT1ilAQHACggvq0aOHRo8eHZTv5fP5lJubq759+6pt27aaP38+4wMogeXLlystLU3PPvusdQqAUpo2bRrjA2GNExCcV/PmzfXGG28oISEhoN/n+PHjmj9/vsaMGcOzHYCf9O/fX5MmTVJiYqJ1CoBiKioqUsOGDbVt2zbrFCBg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duL2228vHaEjvfTSS/nkJz9ZOgbQZAoIAOzEnXfemXXr1pWO0XGuuuqq9Pb2lo4BNJkCAgA7sXLlytx3332lY3SUe+65J9dff33pGEABCggA7AL3gdTPmjVrcsEFF6S/v790FKAABQQAdoH7QOrn6quvzmOPPVY6BlCIAgIAu2DEiBGlI3SEBx98MP/6r/9aOgZQkAICALvg5JNPLh2h7a1duzZTpkxxQz90OQUEAHaBAjJ4X/jCFzJ37tzSMYDCakmq0iEAoJUdeOCBWbBgQekYbW3u3Lk54ogjsnbt2tJRgMJMQABgJ0aPHl06Qlvr6+vLBRdcoHwASRQQANgp61eDc+211+b+++8vHQNoEVawAGAH9thjjyxfvjx/8id/UjpKW3riia1WxgMAABkFSURBVCdy+OGHZ/Xq1aWjAC3CBAQAduDYY49VPgaov78/F154ofIBvIoCAgA7YP1q4L761a/mV7/6VekYQIuxggUAO/D444/n4IMPLh2j7SxevDiHHnpoVq1aVToK0GJMQABgOw488EDlYwCqqspFF12kfADbpIAAwHZYvxqYG264IbfddlvpGECLUkAAYDt8/sfuW7hwYS677LLSMYAW5h4QANgGj9/dff39/TnhhBPyy1/+snQUoIWZgADANnj87u774he/qHwAO6WAAMA2fPzjHy8doa3MmzcvV199dekYQBtQQABgG9z/sevWrFmTSZMm5Q9/+EPpKEAbUEAAYCuHHHJI3vWud5WO0TauvvrqPPzww6VjAG1CAQGArZxyyimlI7SNu+++O1/84hdLxwDaiAICAFtx/8euefnll3Peeeelr6+vdBSgjSggALCFkSNH5oMf/GDpGG3h0ksvzfz580vHANqMAgIAWxg9enSGDh1aOkbLu+2223LDDTeUjgG0IQUEALZg/Wrnli9fnvPOOy9V5bOMgd2ngADARkOGDMlJJ51UOkbLmzZtWp599tnSMYA2pYAAwEajRo3KPvvsUzpGS/vWt76V733ve6VjAG1MAQGAjaxf7djSpUvzt3/7t6VjAG1OAQGAjRSQ7evv78+5556bF154oXQUoM0pIACQ5IADDsihhx5aOkbLmjlzZn7+85+XjgF0AAUEAJKceuqppSO0rNmzZ+dzn/tc6RhAh1BAACDJaaedVjpCS1qxYkUmTZqUdevWlY4CdAgFBICuN3LkyBx77LGlY7SkadOmZeHChaVjAB1EAQGg640ePTrDhg0rHaPl3HDDDZk1a1bpGECHUUAA6HrWr17rySef9MhdoCFqSarSIQCglKFDh+b3v/999t5779JRWsaaNWsyatSoPPjgg6WjAB3IBASArnbCCScoH1uZMWOG8gE0jAICQFezfvVqt956a77yla+UjgF0MCtYAHStWq2W3t7evP3tby8dpSU8/fTTOfzww7N8+fLSUYAOZgICQNc64ogjlI+N+vv7M2XKFOUDaDgFBICuZf3qj77whS/kZz/7WekYQBewggVA13rkkUfynve8p3SM4u677758+MMf9mnnQFMoIAB0pYMOOijz588vHaO4F198MYcffngWL15cOgrQJaxgAdCVxo0bVzpCS/jrv/5r5QNoKgUEgK40YcKE0hGK+9KXvpQbb7yxdAygy1jBAqDr7LffflmyZElqtVrpKMXMnj07xx57bNauXVs6CtBlTEAA6Drjx4/v6vLx+9//PhMnTlQ+gCIUEAC6zvjx40tHKKa/vz+TJ0/O0qVLS0cBupQCAkBXefOb35wPfehDpWMU87nPfS6333576RhAF1NAAOgqY8eOzZAhQ0rHKOKnP/1p/umf/ql0DKDLKSAAdJVuXb/q7e3NJz7xifT19ZWOAnQ5T8ECoGvsvffeWbZsWYYNG1Y6SlOtW7cuxx57bO65557SUQBMQADoHqeddlrXlY8kmT59uvIBtAwFBICu0Y3rV9/5zndy/fXXl44BsJkVLAC6wogRI7Js2bLsueeepaM0zW9/+9t84AMfyKpVq0pHAdjMBASArjBu3LiuKh8vvfRSTj/9dOUDaDkKCABd4cwzzywdoakuvvjizJs3r3QMgNewggVAx9tnn33yu9/9LkOHDi0dpSmuu+66XHLJJaVjAGyTCQgAHW/8+PFdUz7uuuuuXHHFFaVjAGyXAgJAx+uW9ave3t6MHz8+a9euLR0FYLusYAHQ0d761rdm6dKlGTJkSOkoDbV69eocc8wxeeCBB0pHAdghExAAOtqECRM6vnxUVZULLrhA+QDaggICQEfrhvWrmTNn5j/+4z9KxwDYJVawAOhY+++/fxYtWpSens79fdvtt9+e0aNHp6+vr3QUgF3SuT+RAeh6Z5xxRkeXjyeeeCJnnnmm8gG0lc79qQxA15s8eXLpCA2zatWqnH766XnxxRdLRwHYLQoIAB3p3e9+dw477LDSMRqiv78/Z599dh599NHSUQB2mwICQEeaMmVK6QgNc/XVV+eWW24pHQNgQNyEDkDH6enpyaJFi7L//vuXjlJ3P/jBDzJ+/PhUlX++gfZkAgJAxznuuOM6snzMmTMnkydPVj6AtqaAANBxzjnnnNIR6u7555/P6aefnpdffrl0FIBBsYIFQEfZa6+98uyzz2bEiBGlo9TNunXrctJJJ+XOO+8sHQVg0ExAAOgoY8aM6ajykSSXXHKJ8gF0DAUEgI7SaetXM2fOzNe+9rXSMQDqxgoWAB3jLW95S5YsWZKhQ4eWjlIX3//+93PGGWekv7+/dBSAujEBAaBjTJkypWPKxwMPPJBzzz1X+QA6jgkIAB1j3rx5OeSQQ0rHGLRFixblqKOOyrJly0pHAag7ExAAOsJRRx3VEeVj5cqVGTNmjPIBdCwFBICOcP7555eOMGjr16/PhAkTMnfu3NJRABrGChYAbW+vvfbKM888k7333rt0lEGZNm1arr/++tIxABrKBASAtjdhwoS2Lx//8i//onwAXcEEBIC2d+edd+b4448vHWPAfvSjH2Xs2LHp6+srHQWg4RQQANraO9/5zjz55JPp6WnPof7999+f4447Lq+88krpKABN0Z4/rQFgowsvvLBty8fTTz+dcePGKR9AVzEBAaBtDR06NL29vXnrW99aOspuW7FiRY4++mhPvAK6Tnv+yggAkpx22mltWT7Wrl2biRMnKh9AV1JAAGhbU6dOLR1ht/X39+ecc87JHXfcUToKQBFWsABoSwceeGDmz5/fdvd/TJ8+PV/+8pdLxwAopr1+agPARlOnTm278nHNNdcoH0DXMwEBoO287nWvS29vb/bdd9/SUXbZt7/97UyZMiVV5Z9doLu116+OACDJ2LFj26p8/PCHP8xf/dVfKR8AUUAAaEOf/vSnS0fYZffee28mTZqU9evXl44C0BKsYAHQVt773vdmzpw5qdVqpaPs1Lx583L00Ufn+eefLx0FoGWYgADQVi699NK2KB9PP/10Ro8erXwAbMUEBIC28cY3vjFLly7N61//+tJRdmjFihU55phjMmfOnNJRAFqOCQgAbeOiiy5q+fKxevXqnHLKKcoHwHaYgADQFoYMGZL58+fnHe94R+ko29XX15czzjgjN910U+koAC3LBASAtjB27NiWLh9VVeXCCy9UPgB2QgEBoC1ccsklpSPs0BVXXJFvfvObpWMAtDwrWAC0vPe+972ZO3du6Rjb9ZnPfCb//M//XDoGQFswAQGg5V166aWlI2zXNddco3wA7AYTEABa2pve9KYsWbKkJZ9+dd1117X8ahhAqzEBAaClteqjd7/5zW9m+vTppWMAtB0TEABaVqs+evfGG2/MWWedlb6+vtJRANqOCQgALWvcuHEtVz5uvvnmfOITn1A+AAZIAQGgZf3N3/xN6Qivcscdd+Sss87K+vXrS0cBaFtWsABoSYcddlgeeuih0jE2++Uvf5nRo0fnlVdeKR0FoK2ZgADQki6//PLSETa77777cuqppyofAHVgAgJAy9lvv/2yYMGCDBs2rHSUzJ07N8cdd1yef/750lEAOoIJCAAtZ/r06S1RPh555JGceOKJygdAHZmAANBShg8fniVLlmTkyJFFczz22GM54YQT8uyzzxbNAdBpTEAAaCkXXXSR8gHQwUxAAGgZQ4cOzfz583PAAQcUy/Dwww/nxBNPzPLly4tlAOhkJiAAtIyzzjpL+QDocCYgALSM3/zmN3n/+99f5NoPPfRQPvrRjyofAA32utIBACBJPvaxjxUtHyeeeGKee+65ItcH6CZWsABoCaU+ePDBBx9UPgCayAoWAMUdeuihefjhh1Or1Zp63U3lw+d8ADSPCQgAxc2YMaPp5eM3v/mN8gFQgAkIAEXtt99+WbBgQVM/+fy//uu/8rGPfUz5ACjABASAoqZPn97U8jF79ux85CMfUT4ACjEBAaCY4cOHZ8mSJU375PNf/OIXGTNmTFatWtWU6wHwWiYgABQzderUppWPm2++OSeddJLyAVCYCQgARQwdOjTz589vyiefz5o1K+edd17WrVvX8GsBsGMmIAAUcfbZZzelfFx//fWZPHmy8gHQIkxAAGi6Wq2WuXPn5j3veU9DrzNz5sxcddVVDb0GALvndaUDANB9TjnllIaWj6qqcuWVV+baa69t2DUAGBgFBICm+7u/+7uGnd3X15eLL744X//61xt2DQAGzgoWAE31F3/xF5k9e3ZDzl67dm0mT56c7373uw05H4DBMwEBoKn+/u//viHnvvLKKxk/fnx+8pOfNOR8AOrDBASApjn44IMzb9689PTU9yGMK1asyCmnnJK77rqrrucCUH8mIAA0zZVXXln38rFs2bKcfPLJefDBB+t6LgCNYQICQFPst99+WbBgQYYNG1a3M5966qmcfPLJefLJJ+t2JgCN5YMIAWiKSy+9tK7l4957782oUaOUD4A2YwICQMONGDEivb29GTlyZF3Ou/nmmzNp0qSsXr26LucB0DwmIAA03LRp0+pWPq677rpMmDBB+QBoUyYgADTUHnvskYULF2bfffcd1DlVVeUf//Ef8/nPf74+wQAowlOwAGioKVOmDLp8rF27Nueff35mzZpVp1QAlGICAkDD9PT05JFHHskhhxwy4DNWrVqViRMn5rbbbqtjMgBKMQEBoGHGjRs3qPLxzDPP5OMf/3geeuihOqYCoCQTEAAa5p577slRRx01oPfOnTs3o0ePztKlS+ucCoCSPAULgIY4+uijB1w+7rzzzhx99NHKB0AHUkAAaIgZM2YM6H3f+MY3cvLJJ2fFihV1TgRAK7CCBUDdHXzwwZk3b156enb991x9fX35h3/4h8ycObOByQAozU3oANTdFVdcsVvlY9WqVTn77LNzyy23NDAVAK3ABASAunrzm9+cxYsXZ88999yl73/qqacyZsyYzJs3r8HJAGgF7gEBoK6mT5++y+XjrrvuyqhRo5QPgC5iAgJA3bzhDW/I4sWLs88+++z0e7/+9a/nU5/6VNatW9eEZAC0ChMQAOrmwgsv3Gn56Ovry1VXXZWpU6cqHwBdyAQEgLoYMmRIfvvb3+aggw7a7vesXLkykyZNyo9//OMmJgOglXgKFgB1MXHixB2Wj/nz52fMmDF57LHHmpgKgFZjBQuAurj88su3+3e33357jjzySOUDAAUEgME7/vjjc8QRR7zm9aqqMnPmzIwePTovvPBCgWQAtBorWAAM2owZM17z2sqVK3P++efnpptuKpAIgFblJnQABuWQQw7Jo48+mlqttvm1xx9/PKeffrqVKwBewwoWAINy5ZVXvqp8zJo1K0cccYTyAcA2mYAAMGBve9vbsnDhwgwbNizr16/PZz/72cycObN0LABamHtAABiw6dOnZ9iwYXn66adzxhln5Ne//nXpSAC0OBMQAAZk+PDh6e3tzZw5c3LmmWfm2WefLR0JgDaggAAwIJdddlkOPvjgfPrTn866detKxwGgTSggAAzIkUcemfvuu690DADajAICAAA0jcfwAgAA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" type="image/png" />
  <style id="inline-css"></style>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
</head>
<body>
  <header class="nav">
    <div class="nav__inner">
      <a class="brand" href="/" aria-label="Divinity Works">
        <img class="brand__mark" src="data:image/png;base64,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zc3V0qVL9cknn5z151WoUEEdOnRQZmamMjMz1aZNmyCXAkD4S09P1+bNm60zgPNigCCk1K5dWy+//LLS0tKsUzxt8+bNWrlypVatWqW1a9fq2LFjJf4aKSkp6t69u3r27KnMzExVqFAhAKUA4B0bN25U69atrTOAC2KAIGTUqFFDeXl5jA8Dp085cnJytGTJEm3fvt2vXz8qKkrt27dX79691bdvXzVv3tyvXx8AvOAPf/iDxo0bZ50BXBADBCGhZs2aeuWVV9SsWTPrFM/49NNPlZOToxUrVmjdunVB/UTdZs2aqXfv3urdu7cyMjIUGRkZtO8NAKHI5/MpNTVVX331lXUKcEEMELhe9erVlZeXp/T0dOuUsFZYWKg333xT2dnZys7Ods0d4qpVq54ZI1dffbUqVqxonQQArrN27Vp16dLFOgMoFgYIXC0pKUl5eXm66KKLrFPC0t69e/XKK68oJydHS5cu1X/+8x/rpPOKi4tTZmamevfurV/+8peqXr26dRIAuMKIESM0adIk6wygWBggcK2kpCStWbNGLVq0sE4JK5s3b1Z2drZyc3P1r3/9SydPnrROKpXIyEh16NBBAwYM0MCBA5WUlGSdBAAmTp48qTp16ig/P986BSgWBghcifHhPwUFBcrLy9OyZcu0fPly7dy50zrJ76Kjo3XVVVdpwIAB6tevnxISEqyTACBoVq9erR49elhnAMXGAIHrJCYmas2aNbr44outU0LW/v37tWLFCi1dulSrVq3S4cOHrZOCJiYmRt27d9dNN92kvn37KjY21joJAAJqyJAhmjFjhnUGUGwMELhK5cqVlZuby4fUlcL27du1evVq5eTkaPXq1UF9a5VbJSQkqF+/fho0aJC6desmx3GskwDArwoKClSzZk3XP8MH/BgDBK5RuXJlvfzyy7r00kutU0LG6ec5cnJytH79evl8/N/5XJKTkzVw4EDdfvvtatiwoXUOAPjF/Pnz9atf/co6AygRBghcoUqVKsrNzdUll1xineJqhYWFWrdunRYtWqQlS5Zox44d1kkhJyIiQl26dNEtt9yi6667TpUqVbJOAoBS69mzp1auXGmdAZQIAwTmEhIS9NJLL6ldu3bWKa50+vM5Fi5cqAULFmj37t3WSWEjNjZWffr00eDBg9WjRw9FRUVZJwFAse3atUvJyckqLCy0TgFKhAECU5UqVVJubi7j42eOHTuml19+WYsXL9bSpUu1f/9+66SwV7duXd1yyy0aNmyYkpOTrXMA4ILGjBmjBx54wDoDKDEGCMzExcVpxYoV+sUvfmGd4grff/+9Vq5cqUWLFiknJ0ffffeddZInRUZGqk+fPhoxYoQyMzN5cB2Aa6Wlpenjjz+2zgBKjAECE+XKldPixYvVu3dv6xRTp086Fi5cqBdffFGHDh2yTsKPNGrUSEOHDtXQoUNVrVo16xwAOOPNN99Uhw4drDOAUmGAIOgiIiI0e/ZsDRw40DrFxI+f6ZgzZ4727t1rnYQLiI2N1fXXX697771XrVq1ss4BAN1xxx2aPHmydQZQKgwQBJXjOJo4caJ+85vfWKcEVVFRkd544w0tXLhQ8+bN0zfffGOdhFJq06aNhg0bpkGDBikuLs46B4AHFRQUqHbt2jpw4IB1ClAqDBAE1ejRo5WVlWWdETQbNmzQnDlztGDBAu3Zs8c6B35Uo0YN3X777brrrrtUo0YN6xwAHjJv3jzP3iJAeGCAIGgefPBBPf7449YZAbdjxw7NnTtX06dP16effmqdgwCLiYnRDTfcoAcffFBNmza1zgHgAT169NDq1autM4BSY4AgKO644w5NnDjROiNgDh48qOzsbM2cOVNr1qzhE8k9KCIiQr169dJDDz2kyy67zDoHQJj6+uuvlZKSwmd/IKRFWAcg/N1000165plnrDP87vjx43rxxRd17bXXqmbNmho8eLByc3MZHx5VVFSk7OxstW/fXldddZXWrFljnQQgDM2aNYvxgZDHCQgCqk+fPlq0aJHKlStnneI3mzdv1syZMzV9+nTl5+db58DFWrVqpd/97ncaOHAgn7IOwC+aN2+uTz75xDoDKBMGCAKma9euWr58uWJjY61Tymz//v1nnut49913rXMQYho1aqQ//OEPGjJkSFiNcQDB9cYbb6hjx47WGUCZMUAQEO3atVNubq4qVapknVJqhYWFevnllzV9+nQtXbpUx44ds05CiGvQoIH+9Kc/6eabb1ZkZKR1DoAQ85vf/EZTpkyxzgDKjAECv2vSpInWr1+vxMRE65RS+frrrzV16lRNmzZNO3bssM5BGGrWrJkeffRR9e/fXxERPIoH4MK+//571a5dWwcPHrROAcqMAQK/SkxM1Ouvv67GjRtbp5RIUVGR8vLy9Oyzz+rFF1/UyZMnrZPgAenp6frzn/+s/v37y3Ec6xwALjZ37lzddNNN1hmAXzBA4Dfly5fXmjVr1L59e+uUYtuzZ49mzJihKVOmaOvWrdY58Kh27drpkUceUe/eva1TALhU9+7d9dJLL1lnAH7BAIFfREVFacmSJerVq5d1ygX5fD7l5eXp73//u7KzszntgGt06dJFTzzxhDp16mSdAsBFdu7cqdTUVF6/i7DB5WP4xfjx410/PgoKCjRr1iy1bNlSmZmZXLWC67z22mvKyMhQ37599eWXX1rnAHCJmTNnMj4QVjgBQZk9/PDDeuyxx6wzzmnr1q2aOHGipk2bpgMHDljnAMUSGxure++9V3/84x9D+m1yAMrG5/OpadOm+uyzz6xTAL9hgKBMbrzxRs2ePduVD9CuX79e48eP56QDIS0xMVGPPPKI7rzzTl7dC3hQXl6eunXrZp0B+BUDBKV2xRVXaNWqVYqOjrZOOaOgoEALFy7UuHHjtGnTJuscwG/S0tL01FNPqUePHtYpAILohhtu0IIFC6wzAL9igKBUWrVqpddee801V0O+/PLLM9eseEc6wtm1116rp556SqmpqdYpAAIsPz9f9erV0/Hjx61TAL/iIXSUWN26dZWdne2K8bF+/Xpdf/31atq0qZ566inGB8Le4sWLlZaWpkcffZR/KAHC3D/+8Q/+f46wxAkISqRKlSpat26d0tLSzBqOHTum2bNn669//as++ugjsw7AWsuWLTVlyhRddtll1ikA/KyoqEiNGzfmjXgIS5yAoNhiYmK0ZMkSs/Fx4MABPfHEE0pNTdXQoUMZH/C8999/Xx07dtSdd96p//znP9Y5APwoNzeX8YGwxQBBsf3tb39Tly5dgv59t23bpgceeED169fXQw89pD179gS9AXCroqIiTZw4Uc2aNdOsWbOscwD4yZQpU6wTgIDhChaK5b777tO4ceOC+j3feecdPfnkk1q0aBGv0QWKqVevXnr22WdVu3Zt6xQApbR7926lpKToxIkT1ilAQHACggvq0aOHRo8eHZTv5fP5lJubq759+6pt27aaP38+4wMogeXLlystLU3PPvusdQqAUpo2bRrjA2GNExCcV/PmzfXGG28oISEhoN/n+PHjmj9/vsaMGcOzHYCf9O/fX5MmTVJiYqJ1CoBiKioqUsOGDbVt2zbrFCBg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duL2228vHaEjvfTSS/nkJz9ZOgbQZAoIAOzEnXfemXXr1pWO0XGuuuqq9Pb2lo4BNJkCAgA7sXLlytx3332lY3SUe+65J9dff33pGEABCggA7AL3gdTPmjVrcsEFF6S/v790FKAABQQAdoH7QOrn6quvzmOPPVY6BlCIAgIAu2DEiBGlI3SEBx98MP/6r/9aOgZQkAICALvg5JNPLh2h7a1duzZTpkxxQz90OQUEAHaBAjJ4X/jCFzJ37tzSMYDCakmq0iEAoJUdeOCBWbBgQekYbW3u3Lk54ogjsnbt2tJRgMJMQABgJ0aPHl06Qlvr6+vLBRdcoHwASRQQANgp61eDc+211+b+++8vHQNoEVawAGAH9thjjyxfvjx/8id/UjpKW3riia1WxgMAABkFSURBVCdy+OGHZ/Xq1aWjAC3CBAQAduDYY49VPgaov78/F154ofIBvIoCAgA7YP1q4L761a/mV7/6VekYQIuxggUAO/D444/n4IMPLh2j7SxevDiHHnpoVq1aVToK0GJMQABgOw488EDlYwCqqspFF12kfADbpIAAwHZYvxqYG264IbfddlvpGECLUkAAYDt8/sfuW7hwYS677LLSMYAW5h4QANgGj9/dff39/TnhhBPyy1/+snQUoIWZgADANnj87u774he/qHwAO6WAAMA2fPzjHy8doa3MmzcvV199dekYQBtQQABgG9z/sevWrFmTSZMm5Q9/+EPpKEAbUEAAYCuHHHJI3vWud5WO0TauvvrqPPzww6VjAG1CAQGArZxyyimlI7SNu+++O1/84hdLxwDaiAICAFtx/8euefnll3Peeeelr6+vdBSgjSggALCFkSNH5oMf/GDpGG3h0ksvzfz580vHANqMAgIAWxg9enSGDh1aOkbLu+2223LDDTeUjgG0IQUEALZg/Wrnli9fnvPOOy9V5bOMgd2ngADARkOGDMlJJ51UOkbLmzZtWp599tnSMYA2pYAAwEajRo3KPvvsUzpGS/vWt76V733ve6VjAG1MAQGAjaxf7djSpUvzt3/7t6VjAG1OAQGAjRSQ7evv78+5556bF154oXQUoM0pIACQ5IADDsihhx5aOkbLmjlzZn7+85+XjgF0AAUEAJKceuqppSO0rNmzZ+dzn/tc6RhAh1BAACDJaaedVjpCS1qxYkUmTZqUdevWlY4CdAgFBICuN3LkyBx77LGlY7SkadOmZeHChaVjAB1EAQGg640ePTrDhg0rHaPl3HDDDZk1a1bpGECHUUAA6HrWr17rySef9MhdoCFqSarSIQCglKFDh+b3v/999t5779JRWsaaNWsyatSoPPjgg6WjAB3IBASArnbCCScoH1uZMWOG8gE0jAICQFezfvVqt956a77yla+UjgF0MCtYAHStWq2W3t7evP3tby8dpSU8/fTTOfzww7N8+fLSUYAOZgICQNc64ogjlI+N+vv7M2XKFOUDaDgFBICuZf3qj77whS/kZz/7WekYQBewggVA13rkkUfynve8p3SM4u677758+MMf9mnnQFMoIAB0pYMOOijz588vHaO4F198MYcffngWL15cOgrQJaxgAdCVxo0bVzpCS/jrv/5r5QNoKgUEgK40YcKE0hGK+9KXvpQbb7yxdAygy1jBAqDr7LffflmyZElqtVrpKMXMnj07xx57bNauXVs6CtBlTEAA6Drjx4/v6vLx+9//PhMnTlQ+gCIUEAC6zvjx40tHKKa/vz+TJ0/O0qVLS0cBupQCAkBXefOb35wPfehDpWMU87nPfS6333576RhAF1NAAOgqY8eOzZAhQ0rHKOKnP/1p/umf/ql0DKDLKSAAdJVuXb/q7e3NJz7xifT19ZWOAnQ5T8ECoGvsvffeWbZsWYYNG1Y6SlOtW7cuxx57bO65557SUQBMQADoHqeddlrXlY8kmT59uvIBtAwFBICu0Y3rV9/5zndy/fXXl44BsJkVLAC6wogRI7Js2bLsueeepaM0zW9/+9t84AMfyKpVq0pHAdjMBASArjBu3LiuKh8vvfRSTj/9dOUDaDkKCABd4cwzzywdoakuvvjizJs3r3QMgNewggVAx9tnn33yu9/9LkOHDi0dpSmuu+66XHLJJaVjAGyTCQgAHW/8+PFdUz7uuuuuXHHFFaVjAGyXAgJAx+uW9ave3t6MHz8+a9euLR0FYLusYAHQ0d761rdm6dKlGTJkSOkoDbV69eocc8wxeeCBB0pHAdghExAAOtqECRM6vnxUVZULLrhA+QDaggICQEfrhvWrmTNn5j/+4z9KxwDYJVawAOhY+++/fxYtWpSens79fdvtt9+e0aNHp6+vr3QUgF3SuT+RAeh6Z5xxRkeXjyeeeCJnnnmm8gG0lc79qQxA15s8eXLpCA2zatWqnH766XnxxRdLRwHYLQoIAB3p3e9+dw477LDSMRqiv78/Z599dh599NHSUQB2mwICQEeaMmVK6QgNc/XVV+eWW24pHQNgQNyEDkDH6enpyaJFi7L//vuXjlJ3P/jBDzJ+/PhUlX++gfZkAgJAxznuuOM6snzMmTMnkydPVj6AtqaAANBxzjnnnNIR6u7555/P6aefnpdffrl0FIBBsYIFQEfZa6+98uyzz2bEiBGlo9TNunXrctJJJ+XOO+8sHQVg0ExAAOgoY8aM6ajykSSXXHKJ8gF0DAUEgI7SaetXM2fOzNe+9rXSMQDqxgoWAB3jLW95S5YsWZKhQ4eWjlIX3//+93PGGWekv7+/dBSAujEBAaBjTJkypWPKxwMPPJBzzz1X+QA6jgkIAB1j3rx5OeSQQ0rHGLRFixblqKOOyrJly0pHAag7ExAAOsJRRx3VEeVj5cqVGTNmjPIBdCwFBICOcP7555eOMGjr16/PhAkTMnfu3NJRABrGChYAbW+vvfbKM888k7333rt0lEGZNm1arr/++tIxABrKBASAtjdhwoS2Lx//8i//onwAXcEEBIC2d+edd+b4448vHWPAfvSjH2Xs2LHp6+srHQWg4RQQANraO9/5zjz55JPp6WnPof7999+f4447Lq+88krpKABN0Z4/rQFgowsvvLBty8fTTz+dcePGKR9AVzEBAaBtDR06NL29vXnrW99aOspuW7FiRY4++mhPvAK6Tnv+yggAkpx22mltWT7Wrl2biRMnKh9AV1JAAGhbU6dOLR1ht/X39+ecc87JHXfcUToKQBFWsABoSwceeGDmz5/fdvd/TJ8+PV/+8pdLxwAopr1+agPARlOnTm278nHNNdcoH0DXMwEBoO287nWvS29vb/bdd9/SUXbZt7/97UyZMiVV5Z9doLu116+OACDJ2LFj26p8/PCHP8xf/dVfKR8AUUAAaEOf/vSnS0fYZffee28mTZqU9evXl44C0BKsYAHQVt773vdmzpw5qdVqpaPs1Lx583L00Ufn+eefLx0FoGWYgADQVi699NK2KB9PP/10Ro8erXwAbMUEBIC28cY3vjFLly7N61//+tJRdmjFihU55phjMmfOnNJRAFqOCQgAbeOiiy5q+fKxevXqnHLKKcoHwHaYgADQFoYMGZL58+fnHe94R+ko29XX15czzjgjN910U+koAC3LBASAtjB27NiWLh9VVeXCCy9UPgB2QgEBoC1ccsklpSPs0BVXXJFvfvObpWMAtDwrWAC0vPe+972ZO3du6Rjb9ZnPfCb//M//XDoGQFswAQGg5V166aWlI2zXNddco3wA7AYTEABa2pve9KYsWbKkJZ9+dd1117X8ahhAqzEBAaClteqjd7/5zW9m+vTppWMAtB0TEABaVqs+evfGG2/MWWedlb6+vtJRANqOCQgALWvcuHEtVz5uvvnmfOITn1A+AAZIAQGgZf3N3/xN6Qivcscdd+Sss87K+vXrS0cBaFtWsABoSYcddlgeeuih0jE2++Uvf5nRo0fnlVdeKR0FoK2ZgADQki6//PLSETa77777cuqppyofAHVgAgJAy9lvv/2yYMGCDBs2rHSUzJ07N8cdd1yef/750lEAOoIJCAAtZ/r06S1RPh555JGceOKJygdAHZmAANBShg8fniVLlmTkyJFFczz22GM54YQT8uyzzxbNAdBpTEAAaCkXXXSR8gHQwUxAAGgZQ4cOzfz583PAAQcUy/Dwww/nxBNPzPLly4tlAOhkJiAAtIyzzjpL+QDocCYgALSM3/zmN3n/+99f5NoPPfRQPvrRjyofAA32utIBACBJPvaxjxUtHyeeeGKee+65ItcH6CZWsABoCaU+ePDBBx9UPgCayAoWAMUdeuihefjhh1Or1Zp63U3lw+d8ADSPCQgAxc2YMaPp5eM3v/mN8gFQgAkIAEXtt99+WbBgQVM/+fy//uu/8rGPfUz5ACjABASAoqZPn97U8jF79ux85CMfUT4ACjEBAaCY4cOHZ8mSJU375PNf/OIXGTNmTFatWtWU6wHwWiYgABQzderUppWPm2++OSeddJLyAVCYCQgARQwdOjTz589vyiefz5o1K+edd17WrVvX8GsBsGMmIAAUcfbZZzelfFx//fWZPHmy8gHQIkxAAGi6Wq2WuXPn5j3veU9DrzNz5sxcddVVDb0GALvndaUDANB9TjnllIaWj6qqcuWVV+baa69t2DUAGBgFBICm+7u/+7uGnd3X15eLL744X//61xt2DQAGzgoWAE31F3/xF5k9e3ZDzl67dm0mT56c7373uw05H4DBMwEBoKn+/u//viHnvvLKKxk/fnx+8pOfNOR8AOrDBASApjn44IMzb9689PTU9yGMK1asyCmnnJK77rqrrucCUH8mIAA0zZVXXln38rFs2bKcfPLJefDBB+t6LgCNYQICQFPst99+WbBgQYYNG1a3M5966qmcfPLJefLJJ+t2JgCN5YMIAWiKSy+9tK7l4957782oUaOUD4A2YwICQMONGDEivb29GTlyZF3Ou/nmmzNp0qSsXr26LucB0DwmIAA03LRp0+pWPq677rpMmDBB+QBoUyYgADTUHnvskYULF2bfffcd1DlVVeUf//Ef8/nPf74+wQAowlOwAGioKVOmDLp8rF27Nueff35mzZpVp1QAlGICAkDD9PT05JFHHskhhxwy4DNWrVqViRMn5rbbbqtjMgBKMQEBoGHGjRs3qPLxzDPP5OMf/3geeuihOqYCoCQTEAAa5p577slRRx01oPfOnTs3o0ePztKlS+ucCoCSPAULgIY4+uijB1w+7rzzzhx99NHKB0AHUkAAaIgZM2YM6H3f+MY3cvLJJ2fFihV1TgRAK7CCBUDdHXzwwZk3b156enb991x9fX35h3/4h8ycObOByQAozU3oANTdFVdcsVvlY9WqVTn77LNzyy23NDAVAK3ABASAunrzm9+cxYsXZ88999yl73/qqacyZsyYzJs3r8HJAGgF7gEBoK6mT5++y+XjrrvuyqhRo5QPgC5iAgJA3bzhDW/I4sWLs88+++z0e7/+9a/nU5/6VNatW9eEZAC0ChMQAOrmwgsv3Gn56Ovry1VXXZWpU6cqHwBdyAQEgLoYMmRIfvvb3+aggw7a7vesXLkykyZNyo9//OMmJgOglXgKFgB1MXHixB2Wj/nz52fMmDF57LHHmpgKgFZjBQuAurj88su3+3e33357jjzySOUDAAUEgME7/vjjc8QRR7zm9aqqMnPmzIwePTovvPBCgWQAtBorWAAM2owZM17z2sqVK3P++efnpptuKpAIgFblJnQABuWQQw7Jo48+mlqttvm1xx9/PKeffrqVKwBewwoWAINy5ZVXvqp8zJo1K0cccYTyAcA2mYAAMGBve9vbsnDhwgwbNizr16/PZz/72cycObN0LABamHtAABiw6dOnZ9iwYXn66adzxhln5Ne//nXpSAC0OBMQAAZk+PDh6e3tzZw5c3LmmWfm2WefLR0JgDaggAAwIJdddlkOPvjgfPrTn866detKxwGgTSggAAzIkUcemfvuu690DADajAICAAA0jcfwAgAA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" alt="Divinity" width="24" height="24" />
        <span>Divinity<span class="brand__sub">Works</span></span>
      </a>
      <nav class="nav__links">
        <a href="#surfaces">Surfaces</a>
        <a href="#how">Loop</a>
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
        <h1 class="hero__title">Stop starting from scratch.</h1>
        <p class="hero__lede">
          Divinity is the AI coworker that already knows your work. It remembers your emails, meetings, files, and notes — then writes your replies, runs your research, and gets things done across every app.
        </p>
        <div class="hero__cta">
          <button class="btn btn--primary" id="hero-download" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download for <span id="hero-download-os">your device</span>
          </button>
          <a class="btn btn--ghost" href="#how">See how it works</a>
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
            width="1920" height="967" decoding="async" fetchpriority="high" />
        </div>
      </div>
    </section>

    <!-- ===== INTEGRATIONS ===== -->
    <section class="integrations">
      <div class="integrations__inner">
        <p class="integrations__label">Works with the apps you already use</p>
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
        <p class="section__eyebrow">Surfaces</p>
        <h2 class="section__title">Everything in one place.</h2>
        <p class="section__lede">Divinity comes with the apps you already live in — all sharing the same memory.</p>
        <div class="surfaces__grid">
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="6.5" y1="6.5" x2="10.5" y2="10.5"/><line x1="17.5" y1="6.5" x2="13.5" y2="10.5"/><line x1="6.5" y1="17.5" x2="10.5" y2="13.5"/><line x1="17.5" y1="17.5" x2="13.5" y2="13.5"/></svg></span>
            <h3 class="surface__name">Brain</h3>
            <p class="surface__desc">A living memory of your work. Searchable, editable, always there.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
            <h3 class="surface__name">Email</h3>
            <p class="surface__desc">Your inbox, sorted. Replies drafted before you open them.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
            <h3 class="surface__name">Browser</h3>
            <p class="surface__desc">A browser the assistant can drive. You stay in control of logins.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            <h3 class="surface__name">Code</h3>
            <p class="surface__desc">Spin up coding agents that already know your project.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg></span>
            <h3 class="surface__name">Meeting notes</h3>
            <p class="surface__desc">Listen in. Get a clean summary the moment it ends.</p>
          </article>
          <article class="surface">
            <span class="surface__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg></span>
            <h3 class="surface__name">Apps</h3>
            <p class="surface__desc">Build your own apps inside Divinity. They get the same memory and tools.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== LOOP ===== -->
    <section id="how" class="how">
      <div class="section__inner">
        <p class="section__eyebrow">Loop</p>
        <h2 class="section__title">It learns. You ship.</h2>
        <p class="section__lede">The more you use Divinity, the more it knows — and the less you have to explain.</p>
        <div class="how__grid">
          <article class="step">
            <span class="step__num">01</span>
            <h3 class="step__title">Plug in</h3>
            <p class="step__desc">Connect your email, calendar, and files. Divinity starts remembering.</p>
          </article>
          <article class="step">
            <span class="step__num">02</span>
            <h3 class="step__title">Ask</h3>
            <p class="step__desc">Ask anything in plain words. Divinity answers with your real context.</p>
          </article>
          <article class="step">
            <span class="step__num">03</span>
            <h3 class="step__title">Hand it off</h3>
            <p class="step__desc">Drafts, research, emails, tasks — Divinity gets them done across your apps.</p>
          </article>
          <article class="step">
            <span class="step__num">04</span>
            <h3 class="step__title">Wake up ahead</h3>
            <p class="step__desc">Background agents work overnight. You start the day already winning.</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ===== TALK ===== -->
    <section id="talk" class="talk">
      <div class="talk__inner">
        <div class="talk__content">
          <p class="section__eyebrow">Talk</p>
          <h2 class="section__title">Talk to Divinity. Face to face.</h2>
          <p class="section__lede">Open a video call with your AI. Speak naturally. Divinity listens, answers, and remembers every word.</p>
          <ul class="talk__bullets">
            <li>Voice and video, just like a coworker on Zoom.</li>
            <li>Ask out loud. Get answers in real time.</li>
            <li>The whole conversation flows back into your memory.</li>
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
        <h2 class="section__title">Not another agent. The one that remembers.</h2>
        <div class="why__grid">
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It already knows.</strong><span>No cold starts. No re-explaining. Just answers.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It actually does the work.</strong><span>Not just answers — drafts, sends, codes, books.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It's yours.</strong><span>Your work stays on your machine. Always.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It works while you sleep.</strong><span>Wake up to emails sent, research done, tasks handled.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It fits your stack.</strong><span>Plug into the apps you already use — no migration.</span></p>
          </div>
          <div class="why__item">
            <span class="why__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
            <p class="why__text"><strong>It gets sharper over time.</strong><span>Learns your voice, your projects, your way of working.</span></p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== DOWNLOAD ===== -->
    <section id="download" class="download">
      <div class="section__inner">
        <p class="section__eyebrow">Get Divinity</p>
        <h2 class="section__title">One download. You're running.</h2>
        <p class="section__lede">Install Divinity once. Sign in once. It starts learning your work and getting things done from day one.</p>

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
        <p class="download__platforms">v0.1.0 · Also available for Linux ARM64 and Intel Mac</p>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="footer__inner">
      <a class="brand brand--sm" href="/" aria-label="Divinity Works">
        <img class="brand__mark" src="data:image/png;base64,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zc3V0qVL9cknn5z151WoUEEdOnRQZmamMjMz1aZNmyCXAkD4S09P1+bNm60zgPNigCCk1K5dWy+//LLS0tKsUzxt8+bNWrlypVatWqW1a9fq2LFjJf4aKSkp6t69u3r27KnMzExVqFAhAKUA4B0bN25U69atrTOAC2KAIGTUqFFDeXl5jA8Dp085cnJytGTJEm3fvt2vXz8qKkrt27dX79691bdvXzVv3tyvXx8AvOAPf/iDxo0bZ50BXBADBCGhZs2aeuWVV9SsWTPrFM/49NNPlZOToxUrVmjdunVB/UTdZs2aqXfv3urdu7cyMjIUGRkZtO8NAKHI5/MpNTVVX331lXUKcEEMELhe9erVlZeXp/T0dOuUsFZYWKg333xT2dnZys7Ods0d4qpVq54ZI1dffbUqVqxonQQArrN27Vp16dLFOgMoFgYIXC0pKUl5eXm66KKLrFPC0t69e/XKK68oJydHS5cu1X/+8x/rpPOKi4tTZmamevfurV/+8peqXr26dRIAuMKIESM0adIk6wygWBggcK2kpCStWbNGLVq0sE4JK5s3b1Z2drZyc3P1r3/9SydPnrROKpXIyEh16NBBAwYM0MCBA5WUlGSdBAAmTp48qTp16ig/P986BSgWBghcifHhPwUFBcrLy9OyZcu0fPly7dy50zrJ76Kjo3XVVVdpwIAB6tevnxISEqyTACBoVq9erR49elhnAMXGAIHrJCYmas2aNbr44outU0LW/v37tWLFCi1dulSrVq3S4cOHrZOCJiYmRt27d9dNN92kvn37KjY21joJAAJqyJAhmjFjhnUGUGwMELhK5cqVlZuby4fUlcL27du1evVq5eTkaPXq1UF9a5VbJSQkqF+/fho0aJC6desmx3GskwDArwoKClSzZk3XP8MH/BgDBK5RuXJlvfzyy7r00kutU0LG6ec5cnJytH79evl8/N/5XJKTkzVw4EDdfvvtatiwoXUOAPjF/Pnz9atf/co6AygRBghcoUqVKsrNzdUll1xineJqhYWFWrdunRYtWqQlS5Zox44d1kkhJyIiQl26dNEtt9yi6667TpUqVbJOAoBS69mzp1auXGmdAZQIAwTmEhIS9NJLL6ldu3bWKa50+vM5Fi5cqAULFmj37t3WSWEjNjZWffr00eDBg9WjRw9FRUVZJwFAse3atUvJyckqLCy0TgFKhAECU5UqVVJubi7j42eOHTuml19+WYsXL9bSpUu1f/9+66SwV7duXd1yyy0aNmyYkpOTrXMA4ILGjBmjBx54wDoDKDEGCMzExcVpxYoV+sUvfmGd4grff/+9Vq5cqUWLFiknJ0ffffeddZInRUZGqk+fPhoxYoQyMzN5cB2Aa6Wlpenjjz+2zgBKjAECE+XKldPixYvVu3dv6xRTp086Fi5cqBdffFGHDh2yTsKPNGrUSEOHDtXQoUNVrVo16xwAOOPNN99Uhw4drDOAUmGAIOgiIiI0e/ZsDRw40DrFxI+f6ZgzZ4727t1rnYQLiI2N1fXXX697771XrVq1ss4BAN1xxx2aPHmydQZQKgwQBJXjOJo4caJ+85vfWKcEVVFRkd544w0tXLhQ8+bN0zfffGOdhFJq06aNhg0bpkGDBikuLs46B4AHFRQUqHbt2jpw4IB1ClAqDBAE1ejRo5WVlWWdETQbNmzQnDlztGDBAu3Zs8c6B35Uo0YN3X777brrrrtUo0YN6xwAHjJv3jzP3iJAeGCAIGgefPBBPf7449YZAbdjxw7NnTtX06dP16effmqdgwCLiYnRDTfcoAcffFBNmza1zgHgAT169NDq1autM4BSY4AgKO644w5NnDjROiNgDh48qOzsbM2cOVNr1qzhE8k9KCIiQr169dJDDz2kyy67zDoHQJj6+uuvlZKSwmd/IKRFWAcg/N1000165plnrDP87vjx43rxxRd17bXXqmbNmho8eLByc3MZHx5VVFSk7OxstW/fXldddZXWrFljnQQgDM2aNYvxgZDHCQgCqk+fPlq0aJHKlStnneI3mzdv1syZMzV9+nTl5+db58DFWrVqpd/97ncaOHAgn7IOwC+aN2+uTz75xDoDKBMGCAKma9euWr58uWJjY61Tymz//v1nnut49913rXMQYho1aqQ//OEPGjJkSFiNcQDB9cYbb6hjx47WGUCZMUAQEO3atVNubq4qVapknVJqhYWFevnllzV9+nQtXbpUx44ds05CiGvQoIH+9Kc/6eabb1ZkZKR1DoAQ85vf/EZTpkyxzgDKjAECv2vSpInWr1+vxMRE65RS+frrrzV16lRNmzZNO3bssM5BGGrWrJkeffRR9e/fXxERPIoH4MK+//571a5dWwcPHrROAcqMAQK/SkxM1Ouvv67GjRtbp5RIUVGR8vLy9Oyzz+rFF1/UyZMnrZPgAenp6frzn/+s/v37y3Ec6xwALjZ37lzddNNN1hmAXzBA4Dfly5fXmjVr1L59e+uUYtuzZ49mzJihKVOmaOvWrdY58Kh27drpkUceUe/eva1TALhU9+7d9dJLL1lnAH7BAIFfREVFacmSJerVq5d1ygX5fD7l5eXp73//u7KzszntgGt06dJFTzzxhDp16mSdAsBFdu7cqdTUVF6/i7DB5WP4xfjx410/PgoKCjRr1iy1bNlSmZmZXLWC67z22mvKyMhQ37599eWXX1rnAHCJmTNnMj4QVjgBQZk9/PDDeuyxx6wzzmnr1q2aOHGipk2bpgMHDljnAMUSGxure++9V3/84x9D+m1yAMrG5/OpadOm+uyzz6xTAL9hgKBMbrzxRs2ePduVD9CuX79e48eP56QDIS0xMVGPPPKI7rzzTl7dC3hQXl6eunXrZp0B+BUDBKV2xRVXaNWqVYqOjrZOOaOgoEALFy7UuHHjtGnTJuscwG/S0tL01FNPqUePHtYpAILohhtu0IIFC6wzAL9igKBUWrVqpddee801V0O+/PLLM9eseEc6wtm1116rp556SqmpqdYpAAIsPz9f9erV0/Hjx61TAL/iIXSUWN26dZWdne2K8bF+/Xpdf/31atq0qZ566inGB8Le4sWLlZaWpkcffZR/KAHC3D/+8Q/+f46wxAkISqRKlSpat26d0tLSzBqOHTum2bNn669//as++ugjsw7AWsuWLTVlyhRddtll1ikA/KyoqEiNGzfmjXgIS5yAoNhiYmK0ZMkSs/Fx4MABPfHEE0pNTdXQoUMZH/C8999/Xx07dtSdd96p//znP9Y5APwoNzeX8YGwxQBBsf3tb39Tly5dgv59t23bpgceeED169fXQw89pD179gS9AXCroqIiTZw4Uc2aNdOsWbOscwD4yZQpU6wTgIDhChaK5b777tO4ceOC+j3feecdPfnkk1q0aBGv0QWKqVevXnr22WdVu3Zt6xQApbR7926lpKToxIkT1ilAQHACggvq0aOHRo8eHZTv5fP5lJubq759+6pt27aaP38+4wMogeXLlystLU3PPvusdQqAUpo2bRrjA2GNExCcV/PmzfXGG28oISEhoN/n+PHjmj9/vsaMGcOzHYCf9O/fX5MmTVJiYqJ1CoBiKioqUsOGDbVt2zbrFCBg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duL2228vHaEjvfTSS/nkJz9ZOgbQZAoIAOzEnXfemXXr1pWO0XGuuuqq9Pb2lo4BNJkCAgA7sXLlytx3332lY3SUe+65J9dff33pGEABCggA7AL3gdTPmjVrcsEFF6S/v790FKAABQQAdoH7QOrn6quvzmOPPVY6BlCIAgIAu2DEiBGlI3SEBx98MP/6r/9aOgZQkAICALvg5JNPLh2h7a1duzZTpkxxQz90OQUEAHaBAjJ4X/jCFzJ37tzSMYDCakmq0iEAoJUdeOCBWbBgQekYbW3u3Lk54ogjsnbt2tJRgMJMQABgJ0aPHl06Qlvr6+vLBRdcoHwASRQQANgp61eDc+211+b+++8vHQNoEVawAGAH9thjjyxfvjx/8id/UjpKW3riia1WxgMAABkFSURBVCdy+OGHZ/Xq1aWjAC3CBAQAduDYY49VPgaov78/F154ofIBvIoCAgA7YP1q4L761a/mV7/6VekYQIuxggUAO/D444/n4IMPLh2j7SxevDiHHnpoVq1aVToK0GJMQABgOw488EDlYwCqqspFF12kfADbpIAAwHZYvxqYG264IbfddlvpGECLUkAAYDt8/sfuW7hwYS677LLSMYAW5h4QANgGj9/dff39/TnhhBPyy1/+snQUoIWZgADANnj87u774he/qHwAO6WAAMA2fPzjHy8doa3MmzcvV199dekYQBtQQABgG9z/sevWrFmTSZMm5Q9/+EPpKEAbUEAAYCuHHHJI3vWud5WO0TauvvrqPPzww6VjAG1CAQGArZxyyimlI7SNu+++O1/84hdLxwDaiAICAFtx/8euefnll3Peeeelr6+vdBSgjSggALCFkSNH5oMf/GDpGG3h0ksvzfz580vHANqMAgIAWxg9enSGDh1aOkbLu+2223LDDTeUjgG0IQUEALZg/Wrnli9fnvPOOy9V5bOMgd2ngADARkOGDMlJJ51UOkbLmzZtWp599tnSMYA2pYAAwEajRo3KPvvsUzpGS/vWt76V733ve6VjAG1MAQGAjaxf7djSpUvzt3/7t6VjAG1OAQGAjRSQ7evv78+5556bF154oXQUoM0pIACQ5IADDsihhx5aOkbLmjlzZn7+85+XjgF0AAUEAJKceuqppSO0rNmzZ+dzn/tc6RhAh1BAACDJaaedVjpCS1qxYkUmTZqUdevWlY4CdAgFBICuN3LkyBx77LGlY7SkadOmZeHChaVjAB1EAQGg640ePTrDhg0rHaPl3HDDDZk1a1bpGECHUUAA6HrWr17rySef9MhdoCFqSarSIQCglKFDh+b3v/999t5779JRWsaaNWsyatSoPPjgg6WjAB3IBASArnbCCScoH1uZMWOG8gE0jAICQFezfvVqt956a77yla+UjgF0MCtYAHStWq2W3t7evP3tby8dpSU8/fTTOfzww7N8+fLSUYAOZgICQNc64ogjlI+N+vv7M2XKFOUDaDgFBICuZf3qj77whS/kZz/7WekYQBewggVA13rkkUfynve8p3SM4u677758+MMf9mnnQFMoIAB0pYMOOijz588vHaO4F198MYcffngWL15cOgrQJaxgAdCVxo0bVzpCS/jrv/5r5QNoKgUEgK40YcKE0hGK+9KXvpQbb7yxdAygy1jBAqDr7LffflmyZElqtVrpKMXMnj07xx57bNauXVs6CtBlTEAA6Drjx4/v6vLx+9//PhMnTlQ+gCIUEAC6zvjx40tHKKa/vz+TJ0/O0qVLS0cBupQCAkBXefOb35wPfehDpWMU87nPfS6333576RhAF1NAAOgqY8eOzZAhQ0rHKOKnP/1p/umf/ql0DKDLKSAAdJVuXb/q7e3NJz7xifT19ZWOAnQ5T8ECoGvsvffeWbZsWYYNG1Y6SlOtW7cuxx57bO65557SUQBMQADoHqeddlrXlY8kmT59uvIBtAwFBICu0Y3rV9/5zndy/fXXl44BsJkVLAC6wogRI7Js2bLsueeepaM0zW9/+9t84AMfyKpVq0pHAdjMBASArjBu3LiuKh8vvfRSTj/9dOUDaDkKCABd4cwzzywdoakuvvjizJs3r3QMgNewggVAx9tnn33yu9/9LkOHDi0dpSmuu+66XHLJJaVjAGyTCQgAHW/8+PFdUz7uuuuuXHHFFaVjAGyXAgJAx+uW9ave3t6MHz8+a9euLR0FYLusYAHQ0d761rdm6dKlGTJkSOkoDbV69eocc8wxeeCBB0pHAdghExAAOtqECRM6vnxUVZULLrhA+QDaggICQEfrhvWrmTNn5j/+4z9KxwDYJVawAOhY+++/fxYtWpSens79fdvtt9+e0aNHp6+vr3QUgF3SuT+RAeh6Z5xxRkeXjyeeeCJnnnmm8gG0lc79qQxA15s8eXLpCA2zatWqnH766XnxxRdLRwHYLQoIAB3p3e9+dw477LDSMRqiv78/Z599dh599NHSUQB2mwICQEeaMmVK6QgNc/XVV+eWW24pHQNgQNyEDkDH6enpyaJFi7L//vuXjlJ3P/jBDzJ+/PhUlX++gfZkAgJAxznuuOM6snzMmTMnkydPVj6AtqaAANBxzjnnnNIR6u7555/P6aefnpdffrl0FIBBsYIFQEfZa6+98uyzz2bEiBGlo9TNunXrctJJJ+XOO+8sHQVg0ExAAOgoY8aM6ajykSSXXHKJ8gF0DAUEgI7SaetXM2fOzNe+9rXSMQDqxgoWAB3jLW95S5YsWZKhQ4eWjlIX3//+93PGGWekv7+/dBSAujEBAaBjTJkypWPKxwMPPJBzzz1X+QA6jgkIAB1j3rx5OeSQQ0rHGLRFixblqKOOyrJly0pHAag7ExAAOsJRRx3VEeVj5cqVGTNmjPIBdCwFBICOcP7555eOMGjr16/PhAkTMnfu3NJRABrGChYAbW+vvfbKM888k7333rt0lEGZNm1arr/++tIxABrKBASAtjdhwoS2Lx//8i//onwAXcEEBIC2d+edd+b4448vHWPAfvSjH2Xs2LHp6+srHQWg4RQQANraO9/5zjz55JPp6WnPof7999+f4447Lq+88krpKABN0Z4/rQFgowsvvLBty8fTTz+dcePGKR9AVzEBAaBtDR06NL29vXnrW99aOspuW7FiRY4++mhPvAK6Tnv+yggAkpx22mltWT7Wrl2biRMnKh9AV1JAAGhbU6dOLR1ht/X39+ecc87JHXfcUToKQBFWsABoSwceeGDmz5/fdvd/TJ8+PV/+8pdLxwAopr1+agPARlOnTm278nHNNdcoH0DXMwEBoO287nWvS29vb/bdd9/SUXbZt7/97UyZMiVV5Z9doLu116+OACDJ2LFj26p8/PCHP8xf/dVfKR8AUUAAaEOf/vSnS0fYZffee28mTZqU9evXl44C0BKsYAHQVt773vdmzpw5qdVqpaPs1Lx583L00Ufn+eefLx0FoGWYgADQVi699NK2KB9PP/10Ro8erXwAbMUEBIC28cY3vjFLly7N61//+tJRdmjFihU55phjMmfOnNJRAFqOCQgAbeOiiy5q+fKxevXqnHLKKcoHwHaYgADQFoYMGZL58+fnHe94R+ko29XX15czzjgjN910U+koAC3LBASAtjB27NiWLh9VVeXCCy9UPgB2QgEBoC1ccsklpSPs0BVXXJFvfvObpWMAtDwrWAC0vPe+972ZO3du6Rjb9ZnPfCb//M//XDoGQFswAQGg5V166aWlI2zXNddco3wA7AYTEABa2pve9KYsWbKkJZ9+dd1117X8ahhAqzEBAaClteqjd7/5zW9m+vTppWMAtB0TEABaVqs+evfGG2/MWWedlb6+vtJRANqOCQgALWvcuHEtVz5uvvnmfOITn1A+AAZIAQGgZf3N3/xN6Qivcscdd+Sss87K+vXrS0cBaFtWsABoSYcddlgeeuih0jE2++Uvf5nRo0fnlVdeKR0FoK2ZgADQki6//PLSETa77777cuqppyofAHVgAgJAy9lvv/2yYMGCDBs2rHSUzJ07N8cdd1yef/750lEAOoIJCAAtZ/r06S1RPh555JGceOKJygdAHZmAANBShg8fniVLlmTkyJFFczz22GM54YQT8uyzzxbNAdBpTEAAaCkXXXSR8gHQwUxAAGgZQ4cOzfz583PAAQcUy/Dwww/nxBNPzPLly4tlAOhkJiAAtIyzzjpL+QDocCYgALSM3/zmN3n/+99f5NoPPfRQPvrRjyofAA32utIBACBJPvaxjxUtHyeeeGKee+65ItcH6CZWsABoCaU+ePDBBx9UPgCayAoWAMUdeuihefjhh1Or1Zp63U3lw+d8ADSPCQgAxc2YMaPp5eM3v/mN8gFQgAkIAEXtt99+WbBgQVM/+fy//uu/8rGPfUz5ACjABASAoqZPn97U8jF79ux85CMfUT4ACjEBAaCY4cOHZ8mSJU375PNf/OIXGTNmTFatWtWU6wHwWiYgABQzderUppWPm2++OSeddJLyAVCYCQgARQwdOjTz589vyiefz5o1K+edd17WrVvX8GsBsGMmIAAUcfbZZzelfFx//fWZPHmy8gHQIkxAAGi6Wq2WuXPn5j3veU9DrzNz5sxcddVVDb0GALvndaUDANB9TjnllIaWj6qqcuWVV+baa69t2DUAGBgFBICm+7u/+7uGnd3X15eLL744X//61xt2DQAGzgoWAE31F3/xF5k9e3ZDzl67dm0mT56c7373uw05H4DBMwEBoKn+/u//viHnvvLKKxk/fnx+8pOfNOR8AOrDBASApjn44IMzb9689PTU9yGMK1asyCmnnJK77rqrrucCUH8mIAA0zZVXXln38rFs2bKcfPLJefDBB+t6LgCNYQICQFPst99+WbBgQYYNG1a3M5966qmcfPLJefLJJ+t2JgCN5YMIAWiKSy+9tK7l4957782oUaOUD4A2YwICQMONGDEivb29GTlyZF3Ou/nmmzNp0qSsXr26LucB0DwmIAA03LRp0+pWPq677rpMmDBB+QBoUyYgADTUHnvskYULF2bfffcd1DlVVeUf//Ef8/nPf74+wQAowlOwAGioKVOmDLp8rF27Nueff35mzZpVp1QAlGICAkDD9PT05JFHHskhhxwy4DNWrVqViRMn5rbbbqtjMgBKMQEBoGHGjRs3qPLxzDPP5OMf/3geeuihOqYCoCQTEAAa5p577slRRx01oPfOnTs3o0ePztKlS+ucCoCSPAULgIY4+uijB1w+7rzzzhx99NHKB0AHUkAAaIgZM2YM6H3f+MY3cvLJJ2fFihV1TgRAK7CCBUDdHXzwwZk3b156enb991x9fX35h3/4h8ycObOByQAozU3oANTdFVdcsVvlY9WqVTn77LNzyy23NDAVAK3ABASAunrzm9+cxYsXZ88999yl73/qqacyZsyYzJs3r8HJAGgF7gEBoK6mT5++y+XjrrvuyqhRo5QPgC5iAgJA3bzhDW/I4sWLs88+++z0e7/+9a/nU5/6VNatW9eEZAC0ChMQAOrmwgsv3Gn56Ovry1VXXZWpU6cqHwBdyAQEgLoYMmRIfvvb3+aggw7a7vesXLkykyZNyo9//OMmJgOglXgKFgB1MXHixB2Wj/nz52fMmDF57LHHmpgKgFZjBQuAurj88su3+3e33357jjzySOUDAAUEgME7/vjjc8QRR7zm9aqqMnPmzIwePTovvPBCgWQAtBorWAAM2owZM17z2sqVK3P++efnpptuKpAIgFblJnQABuWQQw7Jo48+mlqttvm1xx9/PKeffrqVKwBewwoWAINy5ZVXvqp8zJo1K0cccYTyAcA2mYAAMGBve9vbsnDhwgwbNizr16/PZz/72cycObN0LABamHtAABiw6dOnZ9iwYXn66adzxhln5Ne//nXpSAC0OBMQAAZk+PDh6e3tzZw5c3LmmWfm2WefLR0JgDaggAAwIJdddlkOPvjgfPrTn866detKxwGgTSggAAzIkUcemfvuu690DADajAICAAA0jcfwAgAA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" alt="Divinity" width="20" height="20" />
        <span>Divinity<span class="brand__sub">Works</span></span>
      </a>
      <span class="footer__copy">© <span id="year"></span> Divinity Works</span>
      <nav class="footer__links">
        <a href="#surfaces">Surfaces</a>
        <a href="#how">Loop</a>
        <a href="#talk">Talk</a>
        <a href="#download">Download</a>
      </nav>
    </div>
  </footer>

  <script>
    // OS detection + one-click download
    (function() {
      function detectOS() {
        var ua = navigator.userAgent || navigator.platform || '';
        // iOS/Android -> not supported, return null so user sees all options
        if (/iPad|iPhone|iPod/.test(ua) || /Android|mobile/i.test(ua.toLowerCase())) return null;
        if (/Mac/.test(ua)) return 'mac';
        if (/Windows/.test(ua)) return 'windows';
        if (/Linux/.test(ua)) return 'linux';
        return null;
      }

      var os = detectOS();
      var osLabels = { mac: 'Mac', windows: 'Windows', linux: 'Linux' };
      var osIcons = { mac: '/i/apple.svg', windows: '/i/windows.svg', linux: '/i/linux.svg' };
      var osUrls = {
        mac: '/download/mac',
        windows: '/download/windows',
        linux: '/download/linux'
      };

      // Update button labels if we detected an OS
      if (os && osLabels[os]) {
        var els = document.querySelectorAll('#hero-download-os, #primary-download-os');
        els.forEach(function(el) { el.textContent = osLabels[os]; });

        var detIcon = document.getElementById('detected-icon');
        if (detIcon) {
          detIcon.innerHTML = '<img src="' + osIcons[os] + '" alt="" />';
        }
        var detName = document.getElementById('detected-name');
        if (detName) detName.textContent = osLabels[os];
      } else {
        // Hide the "detected" pill if we couldn't detect
        var pill = document.getElementById('detected-pill');
        if (pill) pill.style.display = 'none';
        var alt = document.querySelector('.download__alt');
        if (alt) alt.style.display = 'none';
        document.querySelectorAll('#hero-download-os, #primary-download-os').forEach(function(el) {
          el.textContent = 'Mac, Windows, Linux';
        });
      }

      // Wire up the three download buttons (nav, hero, primary)
      function triggerDownload(e) {
        if (os && osUrls[os]) {
          e.preventDefault();
          window.location.href = osUrls[os];
        } else {
          // Fallback: scroll to download section
          e.preventDefault();
          document.getElementById('download').scrollIntoView({ behavior: 'smooth' });
        }
      }
      ['nav-download', 'hero-download', 'primary-download'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', triggerDownload);
      });

      // "Browse all downloads" link -> just scroll down to the grid
      var altLink = document.getElementById('alt-link');
      if (altLink) {
        altLink.addEventListener('click', function(e) {
          e.preventDefault();
          document.querySelector('.os-grid').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
