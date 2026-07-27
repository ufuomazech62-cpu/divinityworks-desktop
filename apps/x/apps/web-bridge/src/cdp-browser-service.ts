/**
 * CDPBrowserControlService — cloud browser backed by Chromium + CDP.
 *
 * Replaces ElectronBrowserControlService for web mode. Runs a real
 * Chromium browser on the VM (via Xvfb virtual display), controls it
 * through the Chrome DevTools Protocol (CDP), and streams screencast
 * frames to connected clients over WebSocket.
 *
 * Implements IBrowserControlService so the existing browser-control AI
 * tool works unchanged — the AI calls navigate, click, type, read-page
 * exactly as before.
 *
 * Architecture:
 *   Chromium (Xvfb :99) ← CDP WebSocket → this service → web-bridge WS → client
 *
 * Streaming:
 *   Page.startScreencast → CDP sends Page.screencastFrame events →
 *   we forward base64 JPEG to subscribed WS clients → client draws on <canvas>
 *
 * Input forwarding:
 *   Client sends mouse/keyboard events via WS → we call
 *   Input.dispatchMouseEvent / Input.dispatchKeyEvent via CDP
 */

import type { IBrowserControlService } from '@x/core/dist/application/browser-control/service.js';
import type {
  BrowserControlAction,
  BrowserControlInput,
  BrowserControlResult,
  BrowserPageSnapshot,
  BrowserPageElement,
  BrowserState,
  BrowserTabState,
  SuggestedBrowserSkill,
} from '@x/shared/dist/browser-control.js';
import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { spawn, execSync, ChildProcess } from 'child_process';
import http from 'http';

// ── Page interaction scripts (same as Electron version) ──────────
// We inline the exact same DOM helpers so AI sees identical page
// snapshots regardless of whether the browser is Electron or CDP.

const INTERACTABLE_SELECTORS = [
  'a[href]', 'button', 'input', 'textarea', 'select', 'summary',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
  '[role="option"]', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
].join(', ');

const CLICKABLE_TARGET_SELECTORS = [
  'a[href]', 'button', 'summary', 'label', 'input', 'textarea', 'select',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
  '[role="option"]', '[role="checkbox"]', '[role="radio"]', '[role="switch"]',
  '[role="menuitemcheckbox"]', '[role="menuitemradio"]', '[aria-pressed]',
  '[aria-expanded]', '[aria-checked]', '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const DOM_HELPERS_SOURCE = String.raw`
const truncateText = (value, max) => {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  const safeMax = Math.max(0, max - 3);
  return normalized.slice(0, safeMax).trim() + '...';
};
const cssEscapeValue = (value) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => '\\' + char);
};
const isVisibleElement = (element) => {
  if (!(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const isDisabledElement = (element) => {
  if (!(element instanceof Element)) return true;
  if (element.getAttribute('aria-disabled') === 'true') return true;
  return 'disabled' in element && Boolean(element.disabled);
};
const isUselessClickTarget = (element) => element === document.body || element === document.documentElement;
const getElementRole = (element) => {
  const explicitRole = element.getAttribute('role');
  if (explicitRole) return explicitRole;
  if (element instanceof HTMLAnchorElement) return 'link';
  if (element instanceof HTMLButtonElement) return 'button';
  if (element instanceof HTMLInputElement) return element.type === 'checkbox' ? 'checkbox' : 'input';
  if (element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLSelectElement) return 'combobox';
  if (element instanceof HTMLElement && element.isContentEditable) return 'textbox';
  return null;
};
const getElementType = (element) => {
  if (element instanceof HTMLInputElement) return element.type || 'text';
  if (element instanceof HTMLTextAreaElement) return 'textarea';
  if (element instanceof HTMLSelectElement) return 'select';
  if (element instanceof HTMLButtonElement) return 'button';
  if (element instanceof HTMLElement && element.isContentEditable) return 'contenteditable';
  return null;
};
const getElementLabel = (element) => {
  const ariaLabel = truncateText(element.getAttribute('aria-label') ?? '', 120);
  if (ariaLabel) return ariaLabel;
  if ('labels' in element && element.labels && element.labels.length > 0) {
    const labelText = truncateText(Array.from(element.labels).map((label) => label.innerText || label.textContent || '').join(' '), 120);
    if (labelText) return labelText;
  }
  if (element.id) {
    const label = document.querySelector('label[for="' + cssEscapeValue(element.id) + '"]');
    const labelText = truncateText(label?.textContent ?? '', 120);
    if (labelText) return labelText;
  }
  const placeholder = truncateText(element.getAttribute('placeholder') ?? '', 120);
  if (placeholder) return placeholder;
  const text = truncateText(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : element.textContent ?? '', 120);
  return text || null;
};
const describeElement = (element) => {
  const role = getElementRole(element) || element.tagName.toLowerCase();
  const label = getElementLabel(element);
  return label ? role + ' "' + label + '"' : role;
};
const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
const getAssociatedControl = (element) => {
  if (!(element instanceof Element)) return null;
  if (element instanceof HTMLLabelElement) return element.control;
  const parentLabel = element.closest('label');
  return parentLabel instanceof HTMLLabelElement ? parentLabel.control : null;
};
const resolveClickTarget = (element) => {
  if (!(element instanceof Element)) return null;
  const clickableAncestor = element.closest(${JSON.stringify(CLICKABLE_TARGET_SELECTORS)});
  const labelAncestor = element.closest('label');
  const associatedControl = getAssociatedControl(element);
  const candidates = [clickableAncestor, labelAncestor, associatedControl, element];
  for (const candidate of candidates) {
    if (!(candidate instanceof Element)) continue;
    if (isUselessClickTarget(candidate)) continue;
    if (!isVisibleElement(candidate)) continue;
    if (isDisabledElement(candidate)) continue;
    return candidate;
  }
  for (const candidate of candidates) {
    if (candidate instanceof Element) return candidate;
  }
  return null;
};
const getVerificationTargetState = (element) => {
  if (!(element instanceof Element)) return null;
  const text = truncateText(element.innerText || element.textContent || '', 200);
  const activeElement = document.activeElement;
  const isActive = activeElement instanceof Element ? activeElement === element || element.contains(activeElement) : false;
  return {
    selector: buildUniqueSelector(element), descriptor: describeElement(element), text: text || null,
    checked: element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio') ? element.checked : null,
    value: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? truncateText(element.value ?? '', 200) : element instanceof HTMLSelectElement ? truncateText(element.value ?? '', 200) : element instanceof HTMLElement && element.isContentEditable ? truncateText(element.innerText || element.textContent || '', 200) : null,
    selectedIndex: element instanceof HTMLSelectElement ? element.selectedIndex : null,
    open: 'open' in element && typeof element.open === 'boolean' ? element.open : null,
    disabled: isDisabledElement(element), active: isActive,
    ariaChecked: element.getAttribute('aria-checked'), ariaPressed: element.getAttribute('aria-pressed'), ariaExpanded: element.getAttribute('aria-expanded'),
  };
};
const getPageVerificationState = () => {
  const activeElement = document.activeElement instanceof Element ? document.activeElement : null;
  return { url: window.location.href, title: document.title || '', textSample: truncateText(document.body?.innerText || document.body?.textContent || '', 2000), activeSelector: activeElement ? buildUniqueSelector(activeElement) : null };
};
const buildUniqueSelector = (element) => {
  if (!(element instanceof Element)) return null;
  if (element.id) {
    const idSelector = '#' + cssEscapeValue(element.id);
    try { if (document.querySelectorAll(idSelector).length === 1) return idSelector; } catch {}
  }
  const segments = [];
  let current = element;
  while (current && current instanceof Element && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase();
    if (!tag) break;
    let segment = tag;
    const name = current.getAttribute('name');
    if (name) {
      const nameSelector = tag + '[name="' + cssEscapeValue(name) + '"]';
      try { if (document.querySelectorAll(nameSelector).length === 1) { segments.unshift(nameSelector); return segments.join(' > '); } } catch {}
    }
    const parent = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const position = sameTagSiblings.indexOf(current) + 1;
      segment += ':nth-of-type(' + position + ')';
    }
    segments.unshift(segment);
    const selector = segments.join(' > ');
    try { if (document.querySelectorAll(selector).length === 1) return selector; } catch {}
    current = current.parentElement;
  }
  return segments.length > 0 ? segments.join(' > ') : null;
};
`;

type RawBrowserPageElement = BrowserPageElement & { selector: string };
type RawBrowserPageSnapshot = {
  url: string;
  title: string;
  loading: boolean;
  text: string;
  elements: RawBrowserPageElement[];
};

type ElementTarget = { index?: number; selector?: string; snapshotId?: string };

const DEFAULT_READ_MAX_ELEMENTS = 50;
const DEFAULT_READ_MAX_TEXT_LENGTH = 5000;
const POST_ACTION_MAX_ELEMENTS = 50;
const POST_ACTION_MAX_TEXT_LENGTH = 5000;
const HOME_URL = 'https://www.google.com';
const NAVIGATION_TIMEOUT_MS = 30000;

function buildReadPageScript(maxElements: number, maxTextLength: number): string {
  return `(() => {
    ${DOM_HELPERS_SOURCE}
    const candidates = Array.from(document.querySelectorAll(${JSON.stringify(INTERACTABLE_SELECTORS)}));
    const elements = [];
    const seenSelectors = new Set();
    for (const candidate of candidates) {
      if (!(candidate instanceof Element)) continue;
      if (!isVisibleElement(candidate)) continue;
      const selector = buildUniqueSelector(candidate);
      if (!selector || seenSelectors.has(selector)) continue;
      seenSelectors.add(selector);
      elements.push({
        index: elements.length + 1, selector, tagName: candidate.tagName.toLowerCase(),
        role: getElementRole(candidate), type: getElementType(candidate), label: getElementLabel(candidate),
        text: truncateText(candidate.innerText || candidate.textContent || '', 120) || null,
        placeholder: truncateText(candidate.getAttribute('placeholder') ?? '', 120) || null,
        href: candidate instanceof HTMLAnchorElement ? candidate.href : candidate.getAttribute('href'),
        disabled: isDisabledElement(candidate),
      });
      if (elements.length >= ${JSON.stringify(maxElements)}) break;
    }
    return {
      url: window.location.href, title: document.title || '',
      loading: document.readyState !== 'complete',
      text: truncateText(document.body?.innerText || document.body?.textContent || '', ${JSON.stringify(maxTextLength)}),
      elements,
    };
  })()`;
}

function buildClickScript(selector: string): string {
  return `(() => {
    ${DOM_HELPERS_SOURCE}
    const requestedSelector = ${JSON.stringify(selector)};
    if (/^(body|html)$/i.test(requestedSelector.trim())) return { ok: false, error: 'Refusing to click the page body. Read the page again and target a specific element.' };
    const element = document.querySelector(requestedSelector);
    if (!(element instanceof Element)) return { ok: false, error: 'Element not found.' };
    if (isUselessClickTarget(element)) return { ok: false, error: 'Refusing to click the page body. Read the page again and target a specific element.' };
    const target = resolveClickTarget(element);
    if (!(target instanceof Element)) return { ok: false, error: 'Could not resolve a clickable target.' };
    if (isUselessClickTarget(target)) return { ok: false, error: 'Resolved click target was too generic. Read the page again and choose a specific control.' };
    if (!isVisibleElement(target)) return { ok: false, error: 'Resolved click target is not visible.' };
    if (isDisabledElement(target)) return { ok: false, error: 'Resolved click target is disabled.' };
    const before = { page: getPageVerificationState(), target: getVerificationTargetState(target) };
    if (target instanceof HTMLElement) { target.scrollIntoView({ block: 'center', inline: 'center' }); target.focus({ preventScroll: true }); }
    const rect = target.getBoundingClientRect();
    const clientX = clampNumber(rect.left + (rect.width / 2), 1, Math.max(1, window.innerWidth - 1));
    const clientY = clampNumber(rect.top + (rect.height / 2), 1, Math.max(1, window.innerHeight - 1));
    const topElement = document.elementFromPoint(clientX, clientY);
    const eventTarget = topElement instanceof Element && (topElement === target || topElement.contains(target) || target.contains(topElement)) ? topElement : target;
    if (eventTarget instanceof HTMLElement) eventTarget.focus({ preventScroll: true });
    return {
      ok: true, description: describeElement(target),
      clickPoint: { x: Math.round(clientX), y: Math.round(clientY) },
      verification: { before, targetSelector: buildUniqueSelector(target) || requestedSelector },
    };
  })()`;
}

function buildVerifyClickScript(targetSelector: string | null, before: unknown): string {
  return `(() => {
    ${DOM_HELPERS_SOURCE}
    const beforeState = ${JSON.stringify(before)};
    const selector = ${JSON.stringify(targetSelector)};
    const afterPage = getPageVerificationState();
    const afterTarget = selector ? getVerificationTargetState(document.querySelector(selector)) : null;
    const beforeTarget = beforeState?.target ?? null;
    const reasons = [];
    if (beforeState?.page?.url !== afterPage.url) reasons.push('url changed');
    if (beforeState?.page?.title !== afterPage.title) reasons.push('title changed');
    if (beforeState?.page?.textSample !== afterPage.textSample) reasons.push('page text changed');
    if (beforeState?.page?.activeSelector !== afterPage.activeSelector) reasons.push('focus changed');
    if (beforeTarget && !afterTarget) reasons.push('clicked element disappeared');
    if (beforeTarget && afterTarget) {
      if (beforeTarget.checked !== afterTarget.checked) reasons.push('checked state changed');
      if (beforeTarget.value !== afterTarget.value) reasons.push('value changed');
      if (beforeTarget.selectedIndex !== afterTarget.selectedIndex) reasons.push('selection changed');
      if (beforeTarget.open !== afterTarget.open) reasons.push('open state changed');
      if (beforeTarget.disabled !== afterTarget.disabled) reasons.push('disabled state changed');
      if (beforeTarget.active !== afterTarget.active) reasons.push('target focus changed');
      if (beforeTarget.ariaChecked !== afterTarget.ariaChecked) reasons.push('aria-checked changed');
      if (beforeTarget.ariaPressed !== afterTarget.ariaPressed) reasons.push('aria-pressed changed');
      if (beforeTarget.ariaExpanded !== afterTarget.ariaExpanded) reasons.push('aria-expanded changed');
      if (beforeTarget.text !== afterTarget.text) reasons.push('target text changed');
    }
    return { changed: reasons.length > 0, reasons };
  })()`;
}

function buildTypeScript(selector: string, text: string): string {
  return `(() => {
    ${DOM_HELPERS_SOURCE}
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof Element)) return { ok: false, error: 'Element not found.' };
    if (!isVisibleElement(element)) return { ok: false, error: 'Element is not visible.' };
    if (isDisabledElement(element)) return { ok: false, error: 'Element is disabled.' };
    const nextValue = ${JSON.stringify(text)};
    const setNativeValue = (target, value) => {
      const prototype = Object.getPrototypeOf(target);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && typeof descriptor.set === 'function') descriptor.set.call(target, value);
      else target.value = value;
    };
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element.readOnly) return { ok: false, error: 'Element is read-only.' };
      element.scrollIntoView({ block: 'center', inline: 'center' });
      element.focus({ preventScroll: true });
      setNativeValue(element, nextValue);
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue, inputType: 'insertText' }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, description: describeElement(element) };
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.scrollIntoView({ block: 'center', inline: 'center' });
      element.focus({ preventScroll: true });
      element.textContent = nextValue;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue, inputType: 'insertText' }));
      return { ok: true, description: describeElement(element) };
    }
    return { ok: false, error: 'Element does not accept text input.' };
  })()`;
}

function buildFocusScript(selector: string): string {
  return `(() => {
    ${DOM_HELPERS_SOURCE}
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof Element)) return { ok: false, error: 'Element not found.' };
    if (!isVisibleElement(element)) return { ok: false, error: 'Element is not visible.' };
    if (element instanceof HTMLElement) { element.scrollIntoView({ block: 'center', inline: 'center' }); element.focus({ preventScroll: true }); }
    return { ok: true, description: describeElement(element) };
  })()`;
}

function buildScrollScript(offset: number): string {
  return `(() => { window.scrollBy({ top: ${JSON.stringify(offset)}, left: 0, behavior: 'auto' }); return { ok: true }; })()`;
}

// ── Navigation target normalization (same as Electron version) ──

const SEARCH_ENGINE_BASE_URL = 'https://www.google.com/search?q=';
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const IPV4_HOST_RE = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:\/.*)?$/;
const LOCALHOST_RE = /^localhost(?::\d+)?(?:\/.*)?$/i;
const DOMAIN_LIKE_RE = /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i;

function normalizeNavigationTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) throw new Error('Navigation target cannot be empty.');
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('file://') || lower.startsWith('chrome://') || lower.startsWith('chrome-extension://')) {
    throw new Error('That URL scheme is not allowed in the embedded browser.');
  }
  if (HAS_SCHEME_RE.test(trimmed)) return trimmed;
  const looksLikeHost = LOCALHOST_RE.test(trimmed) || DOMAIN_LIKE_RE.test(trimmed) || IPV4_HOST_RE.test(trimmed);
  if (looksLikeHost && !/\s/.test(trimmed)) {
    const scheme = LOCALHOST_RE.test(trimmed) || IPV4_HOST_RE.test(trimmed) ? 'http://' : 'https://';
    return `${scheme}${trimmed}`;
  }
  return `${SEARCH_ENGINE_BASE_URL}${encodeURIComponent(trimmed)}`;
}

function normalizeKeyCode(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return 'Enter';
  const aliases: Record<string, string> = {
    esc: 'Escape', escape: 'Escape', return: 'Enter', enter: 'Enter', tab: 'Tab',
    space: 'Space', ' ': 'Space', left: 'ArrowLeft', right: 'ArrowRight',
    up: 'ArrowUp', down: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
    arrowup: 'ArrowUp', arrowdown: 'ArrowDown', backspace: 'Backspace', delete: 'Delete',
  };
  const alias = aliases[trimmed.toLowerCase()];
  if (alias) return alias;
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

// ── CDP client — low-level Chrome DevTools Protocol over WebSocket ──

interface CDPTarget {
  targetId: string;
  type: string;
  url: string;
  title: string;
  webSocketDebuggerUrl: string;
}

class CDPClient {
  private ws: WebSocket | null = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private eventListeners = new Map<string, ((params: any) => void)[]>();
  private connected = false;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      const timeout = setTimeout(() => reject(new Error('CDP connect timeout')), 10000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        console.log('[cdp] Connected to', this.url);
        resolve();
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id !== undefined) {
            // Response to a command
            const p = this.pending.get(msg.id);
            if (p) {
              this.pending.delete(msg.id);
              if (msg.error) {
                p.reject(new Error(msg.error.message || 'CDP error'));
              } else {
                p.resolve(msg.result);
              }
            }
          } else if (msg.method) {
            // Event
            const listeners = this.eventListeners.get(msg.method);
            if (listeners) {
              for (const l of listeners) {
                try { l(msg.params); } catch (e) { console.error('[cdp] Event listener error:', e); }
              }
            }
          }
        } catch (e) {
          console.error('[cdp] Parse error:', e);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        if (!this.connected) reject(err);
        else console.error('[cdp] WebSocket error:', err);
      });

      this.ws.on('close', () => {
        this.connected = false;
        for (const [id, p] of Array.from(this.pending)) {
          p.reject(new Error('CDP connection closed'));
        }
        this.pending.clear();
        console.warn('[cdp] Connection closed');
      });
    });
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.ws || !this.connected) throw new Error('CDP not connected');
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
  }

  on(event: string, listener: (params: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off(event: string, listener: (params: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    }
  }

  removeAllListeners(event: string): void {
    this.eventListeners.delete(event);
  }

  get isConnected(): boolean { return this.connected; }

  close(): void {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
      this.connected = false;
    }
  }
}

// ── Browser tab — one Chromium target per tab ───────────────────

interface BrowserTab {
  id: string;
  targetId: string;
  cdp: CDPClient;
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  domReady: boolean;
  loadError: string | null;
  // Snapshot cache for element index → selector mapping
  snapshotCache: { snapshotId: string; elements: { index: number; selector: string }[] } | null;
  // Screencast subscribers for this tab
  screencastClients: Set<WebSocket>;
}

const EMPTY_STATE: BrowserState = { activeTabId: null, tabs: [] };

// ── CDPBrowserControlService ─────────────────────────────────────

export class CDPBrowserControlService implements IBrowserControlService {
  private chromiumProcess: ChildProcess | null = null;
  private browserCdp: CDPClient | null = null; // browser-level CDP for creating/listing targets
  private tabs = new Map<string, BrowserTab>();
  private tabOrder: string[] = [];
  private activeTabId: string | null = null;
  private screencastClients = new Set<WebSocket>();
  private started = false;
  private startPromise: Promise<void> | null = null;

  // ── Lifecycle: start Chromium on Xvfb, connect browser-level CDP ──

  async start(): Promise<void> {
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this._doStart();
    return this.startPromise;
  }

  private async _doStart(): Promise<void> {

    // Ensure Xvfb is running on display :99
    try {
      try {
        execSync('pgrep -x Xvfb', { stdio: 'ignore' });
      } catch {
        console.log('[cdp-browser] Starting Xvfb on :99...');
        spawn('Xvfb', [':99', '-screen', '0', '1280x900x24'], {
          detached: true, stdio: 'ignore',
        }).unref();
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch {}

    // Start Chromium with remote debugging
    const cdpPort = 9222;
    console.log('[cdp-browser] Starting Chromium...');

    this.chromiumProcess = spawn('chromium-browser', [
      `--display=:99`,
      `--remote-debugging-port=${cdpPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-features=VizDisplayCompositor',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--disable-default-apps',
      '--no-proxy-server',
      '--window-size=1280,900',
      'about:blank',
    ], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, DISPLAY: ':99' },
    });

    this.chromiumProcess.unref();

    // Wait for CDP to become available
    await this.waitForCdp(cdpPort, 15000);

    // Connect to the browser-level CDP endpoint
    // Fetch the browser's webSocketDebuggerUrl from /json/version
    const versionResp = await new Promise<string>((resolve, reject) => {
      http.get(`http://127.0.0.1:${cdpPort}/json/version`, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => body += chunk);
        res.on('end', () => resolve(body));
      }).on('error', reject);
    });
    const versionInfo = JSON.parse(versionResp);
    const browserWsUrl = versionInfo.webSocketDebuggerUrl;
    this.browserCdp = new CDPClient(browserWsUrl);
    await this.browserCdp.connect();

    // Set up browser-level event listeners for target discovery
    this.browserCdp.on('Target.targetCreated', async (params: any) => {
      const target = params.targetInfo;
      if (target.type === 'page' && !this.tabs.has(target.targetId)) {
        await this.attachTarget(target);
      }
    });

    // Discover existing targets (tabs)
    const targetsResp = await this.browserCdp.send('Target.getTargets');
    const targetInfos: any[] = targetsResp?.targetInfos ?? [];
    const pageTargets = targetInfos.filter((t: any) => t.type === 'page');

    if (pageTargets.length === 0) {
      // Create an initial tab
      const { targetId } = await this.browserCdp.send('Target.createTarget', { url: HOME_URL });
      await this.attachTarget({ targetId, type: 'page', url: HOME_URL, title: '', webSocketDebuggerUrl: '' });
    } else {
      for (const target of pageTargets) {
        await this.attachTarget(target);
      }
      if (this.tabOrder.length > 0) {
        this.activeTabId = this.tabOrder[0];
      }
    }
    this.started = true;
    console.log('[cdp-browser] Chromium started, CDP connected');
  }

  private async waitForCdp(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const data = await new Promise<string>((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/json/version`, (res: any) => {
            let body = '';
            res.on('data', (chunk: any) => body += chunk);
            res.on('end', () => resolve(body));
          });
          req.on('error', reject);
          req.setTimeout(2000, () => reject(new Error('timeout')));
        });
        const info = JSON.parse(data);
        console.log('[cdp-browser] CDP endpoint ready:', info.Browser);
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`CDP endpoint did not become available on port ${port} within ${timeoutMs}ms`);
  }

  private async attachTarget(targetInfo: any): Promise<void> {
    const targetId = targetInfo.targetId;
    if (this.tabs.has(targetId)) return;

    // Get the webSocketDebuggerUrl for this target
    let wsUrl = targetInfo.webSocketDebuggerUrl;
    if (!wsUrl) {
      // Target.getTargets doesn't include webSocketDebuggerUrl;
      // fetch it from the /json HTTP endpoint
      try {
        const tabsResp = await new Promise<string>((resolve, reject) => {
          http.get('http://127.0.0.1:9222/json', (res: any) => {
            let body = '';
            res.on('data', (chunk: any) => body += chunk);
            res.on('end', () => resolve(body));
          }).on('error', reject);
        });
        const tabs = JSON.parse(tabsResp);
        const t = Array.isArray(tabs) ? tabs.find((t: any) => t.id === targetId || t.targetId === targetId) : null;
        if (t) wsUrl = t.webSocketDebuggerUrl;
      } catch {}
    }

    if (!wsUrl) {
      console.warn(`[cdp-browser] No webSocketDebuggerUrl for target ${targetId}, skipping`);
      return;
    }

    // Attach to the target (required for Target.* events)
    await this.browserCdp!.send('Target.attachToTarget', { targetId, flatten: true });

    // Connect a CDP client to this target
    const cdp = new CDPClient(wsUrl);
    await cdp.connect();

    const tabId = randomUUID();
    const tab: BrowserTab = {
      id: tabId,
      targetId,
      cdp,
      url: targetInfo.url || HOME_URL,
      title: targetInfo.title || '',
      canGoBack: false,
      canGoForward: false,
      loading: false,
      domReady: false,
      loadError: null,
      snapshotCache: null,
      screencastClients: new Set(),
    };

    this.tabs.set(tabId, tab);
    this.tabOrder.push(tabId);
    if (!this.activeTabId) this.activeTabId = tabId;

    // Enable required domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // Listen for page events
    cdp.on('Page.frameNavigated', (params: any) => {
      if (params.frame.parentId === undefined) {
        // Main frame navigated
        tab.url = params.frame.url || tab.url;
        tab.domReady = false;
      }
    });

    cdp.on('Page.lifecycleEvent', (params: any) => {
      if (params.name === 'DOMContentLoaded') {
        tab.domReady = true;
      } else if (params.name === 'load') {
        tab.loading = false;
        this.emitState();
      }
    });

    cdp.on('Page.loadEventFired', () => {
      tab.loading = false;
      tab.domReady = true;
      this.emitState();
      this.updateTabInfo(tab);
    });

    // Get initial state
    const evalResult = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ url: location.href, title: document.title })',
      returnByValue: true,
    });
    try {
      const info = JSON.parse(evalResult.result.value);
      tab.url = info.url;
      tab.title = info.title;
    } catch {}

    this.emitState();
    console.log(`[cdp-browser] Tab attached: ${tabId} → ${tab.url}`);
  }

  private async updateTabInfo(tab: BrowserTab): Promise<void> {
    try {
      const evalResult = await tab.cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify({ url: location.href, title: document.title })',
        returnByValue: true,
      });
      const info = JSON.parse(evalResult.result.value);
      tab.url = info.url;
      tab.title = info.title;
    } catch {}
  }

  private getActiveTab(): BrowserTab | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) ?? null;
  }

  private ensureInitialTab(): BrowserTab | null {
    const tab = this.getActiveTab();
    if (tab) return tab;
    if (this.tabOrder.length > 0) {
      this.activeTabId = this.tabOrder[0];
      return this.tabs.get(this.activeTabId) ?? null;
    }
    return null;
  }

  private snapshotTabState(tab: BrowserTab): BrowserTabState {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      canGoBack: tab.canGoBack,
      canGoForward: tab.canGoForward,
      loading: tab.loading,
    };
  }

  private getState(): BrowserState {
    if (this.tabOrder.length === 0) return { ...EMPTY_STATE };
    return {
      activeTabId: this.activeTabId,
      tabs: this.tabOrder
        .map((id) => this.tabs.get(id))
        .filter((t): t is BrowserTab => t != null)
        .map((t) => this.snapshotTabState(t)),
    };
  }

  private emitState(): void {
    // State is pushed to clients via the WS message 'browser:didUpdateState'
    // — the web-bridge server calls getBrowserState() and broadcasts.
  }

  // ── Page waiting (waitForSettle) ───────────────────────────────

  private async waitForSettle(tab: BrowserTab, signal?: AbortSignal, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (signal?.aborted) throw new Error('Aborted');
      if (tab.loadError) throw new Error(tab.loadError);

      // Check if page is still loading
      try {
        const result = await tab.cdp.send('Runtime.evaluate', {
          expression: 'document.readyState',
          returnByValue: true,
        });
        const readyState = result.result.value;
        if (readyState === 'complete' && !tab.loading) {
          await new Promise((r) => setTimeout(r, 100));
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // ── Execute JS on active tab ──────────────────────────────────

  private async executeOnActiveTab<T>(script: string, signal?: AbortSignal, options?: { waitForReady?: boolean }): Promise<T> {
    if (signal?.aborted) throw new Error('Aborted');
    const tab = this.getActiveTab() ?? this.ensureInitialTab();
    if (!tab) throw new Error('No browser tab is open.');
    if (options?.waitForReady !== false) {
      await this.waitForSettle(tab, signal);
    }
    if (signal?.aborted) throw new Error('Aborted');
    const result = await tab.cdp.send('Runtime.evaluate', {
      expression: script,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'Script execution failed');
    }
    return result.result.value as T;
  }

  // ── Snapshot management ─────────────────────────────────────────

  private cacheSnapshot(tab: BrowserTab, raw: RawBrowserPageSnapshot): BrowserPageSnapshot {
    const snapshotId = randomUUID();
    const elements: BrowserPageElement[] = raw.elements.map((el, i) => {
      const { selector, ...rest } = el;
      return { ...rest, index: i + 1 };
    });

    tab.snapshotCache = {
      snapshotId,
      elements: raw.elements.map((el, i) => ({ index: i + 1, selector: el.selector })),
    };

    return { snapshotId, url: raw.url, title: raw.title, loading: raw.loading, text: raw.text, elements };
  }

  private invalidateSnapshot(tab: BrowserTab): void {
    tab.snapshotCache = null;
  }

  private resolveElementSelector(tab: BrowserTab, target: ElementTarget): { ok: boolean; selector?: string; error?: string } {
    if (target.selector?.trim()) return { ok: true, selector: target.selector.trim() };
    if (target.index == null) return { ok: false, error: 'Provide an element index or selector.' };
    if (!tab.snapshotCache) return { ok: false, error: 'No page snapshot is available yet. Call read-page first.' };
    if (target.snapshotId && tab.snapshotCache.snapshotId !== target.snapshotId)
      return { ok: false, error: 'The page changed since the last read-page call. Call read-page again.' };
    const entry = tab.snapshotCache.elements.find((e) => e.index === target.index);
    if (!entry) return { ok: false, error: `No element found for index ${target.index}.` };
    return { ok: true, selector: entry.selector };
  }

  // ── Page reading ───────────────────────────────────────────────

  private async readPage(tab: BrowserTab, options?: { maxElements?: number; maxTextLength?: number; waitForReady?: boolean }, signal?: AbortSignal): Promise<{ ok: boolean; page?: BrowserPageSnapshot; error?: string }> {
    try {
      const raw = await this.executeOnActiveTab<RawBrowserPageSnapshot>(
        buildReadPageScript(options?.maxElements ?? DEFAULT_READ_MAX_ELEMENTS, options?.maxTextLength ?? DEFAULT_READ_MAX_TEXT_LENGTH),
        signal,
        { waitForReady: options?.waitForReady },
      );
      // Check loading state
      const loadingResult = await tab.cdp.send('Runtime.evaluate', {
        expression: 'document.readyState !== "complete"',
        returnByValue: true,
      });
      return { ok: true, page: this.cacheSnapshot(tab, { ...raw, loading: loadingResult.result.value }) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to read the current page.' };
    }
  }

  private async readPageSummary(tab: BrowserTab, signal?: AbortSignal, options?: { waitForReady?: boolean }): Promise<BrowserPageSnapshot | null> {
    const result = await this.readPage(tab, { maxElements: POST_ACTION_MAX_ELEMENTS, maxTextLength: POST_ACTION_MAX_TEXT_LENGTH, waitForReady: options?.waitForReady }, signal);
    return result.ok ? result.page ?? null : null;
  }

  // ── IBrowserControlService.execute ────────────────────────────

  async execute(input: BrowserControlInput, ctx?: { signal?: AbortSignal }): Promise<BrowserControlResult> {
    const signal = ctx?.signal;

    // Ensure Chromium is started
    if (!this.started || !this.browserCdp) {
      await this.start();
    }

    const buildSuccess = (action: BrowserControlAction, message: string, page?: BrowserPageSnapshot): BrowserControlResult => ({
      success: true, action, message, browser: this.getState(), ...(page ? { page } : {}),
    });
    const buildError = (action: BrowserControlAction, error: string): BrowserControlResult => ({
      success: false, action, error, browser: this.getState(),
    });

    try {
      switch (input.action) {
        case 'open': {
          const tab = this.getActiveTab() ?? this.ensureInitialTab();
          if (!tab) return buildError('open', 'No browser tab available.');
          await this.waitForSettle(tab, signal);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('open', 'Opened a browser session.', page);
        }

        case 'get-state':
          return buildSuccess('get-state', 'Read the current browser state.');

        case 'new-tab': {
          const target = input.target ? normalizeNavigationTarget(input.target) : HOME_URL;
          const { targetId } = await this.browserCdp!.send('Target.createTarget', { url: target });
          // Wait for the target to be attached (the Target.targetCreated listener will fire)
          await new Promise((r) => setTimeout(r, 500));
          // Attach if not already attached
          if (!this.tabs.has(targetId)) {
            await this.attachTarget({ targetId, type: 'page', url: target, title: '', webSocketDebuggerUrl: '' });
          }
          // Switch to the new tab
          this.activeTabId = this.tabs.has(targetId) ? targetId : this.tabOrder[this.tabOrder.length - 1];
          const newTab = this.getActiveTab()!;
          await this.waitForSettle(newTab, signal);
          const page = await this.readPageSummary(newTab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('new-tab', `Opened a new tab for ${target}.`, page);
        }

        case 'switch-tab': {
          if (!input.tabId) return buildError('switch-tab', 'tabId is required for switch-tab.');
          const tab = this.tabs.get(input.tabId);
          if (!tab) return buildError('switch-tab', `No browser tab exists with id ${input.tabId}.`);
          this.activeTabId = input.tabId;
          await this.waitForSettle(tab, signal);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('switch-tab', `Switched to tab ${input.tabId}.`, page);
        }

        case 'close-tab': {
          if (!input.tabId) return buildError('close-tab', 'tabId is required for close-tab.');
          const tab = this.tabs.get(input.tabId);
          if (!tab) return buildError('close-tab', `No browser tab exists with id ${input.tabId}.`);
          if (this.tabOrder.length <= 1) return buildError('close-tab', 'Cannot close the only tab.');

          const closingIndex = this.tabOrder.indexOf(input.tabId);
          this.activeTabId = this.activeTabId === input.tabId
            ? (this.tabOrder[closingIndex + 1] ?? this.tabOrder[closingIndex - 1] ?? null)
            : this.activeTabId;

          // Close the target via CDP
          try { await this.browserCdp!.send('Target.closeTarget', { targetId: tab.targetId }); } catch {}
          tab.cdp.close();
          this.tabs.delete(input.tabId);
          this.tabOrder = this.tabOrder.filter((id) => id !== input.tabId);

          const activeTab = this.getActiveTab();
          if (activeTab) {
            await this.waitForSettle(activeTab, signal);
            const page = await this.readPageSummary(activeTab, signal, { waitForReady: false }) ?? undefined;
            return buildSuccess('close-tab', `Closed tab ${input.tabId}.`, page);
          }
          return buildSuccess('close-tab', `Closed tab ${input.tabId}.`);
        }

        case 'navigate': {
          if (!input.target) return buildError('navigate', 'target is required for navigate.');
          const target = normalizeNavigationTarget(input.target);
          const tab = this.getActiveTab() ?? this.ensureInitialTab();
          if (!tab) return buildError('navigate', 'No browser tab is open.');
          this.invalidateSnapshot(tab);
          tab.loading = true;
          this.emitState();
          await tab.cdp.send('Page.navigate', { url: target });
          await this.waitForSettle(tab, signal);
          await this.updateTabInfo(tab);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('navigate', `Navigated to ${target}.`, page);
        }

        case 'back': {
          const tab = this.getActiveTab();
          if (!tab) return buildError('back', 'No active browser tab is open.');
          this.invalidateSnapshot(tab);
          await tab.cdp.send('Page.navigate', { url: 'chrome://back' }).catch(async () => {
            // Fallback: use history navigation via Runtime.evaluate
            await tab.cdp.send('Runtime.evaluate', { expression: 'history.back()' });
          });
          await this.waitForSettle(tab, signal);
          await this.updateTabInfo(tab);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('back', 'Went back in the active tab.', page);
        }

        case 'forward': {
          const tab = this.getActiveTab();
          if (!tab) return buildError('forward', 'No active browser tab is open.');
          this.invalidateSnapshot(tab);
          await tab.cdp.send('Runtime.evaluate', { expression: 'history.forward()' });
          await this.waitForSettle(tab, signal);
          await this.updateTabInfo(tab);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('forward', 'Went forward in the active tab.', page);
        }

        case 'reload': {
          const tab = this.getActiveTab();
          if (!tab) return buildError('reload', 'No active browser tab is open.');
          this.invalidateSnapshot(tab);
          tab.loading = true;
          await tab.cdp.send('Page.reload');
          await this.waitForSettle(tab, signal);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('reload', 'Reloaded the active tab.', page);
        }

        case 'read-page': {
          const tab = this.getActiveTab() ?? this.ensureInitialTab();
          if (!tab) return buildError('read-page', 'No active browser tab is open.');
          const result = await this.readPage(tab, { maxElements: input.maxElements, maxTextLength: input.maxTextLength }, signal);
          if (!result.ok || !result.page) return buildError('read-page', result.error ?? 'Failed to read the current page.');
          return buildSuccess('read-page', 'Read the current page.', result.page);
        }

        case 'click': {
          const tab = this.getActiveTab();
          if (!tab) return buildError('click', 'No active browser tab is open.');
          const resolved = this.resolveElementSelector(tab, { index: input.index, selector: input.selector, snapshotId: input.snapshotId });
          if (!resolved.ok || !resolved.selector) return buildError('click', resolved.error ?? 'Failed to resolve element.');

          const result = await this.executeOnActiveTab<{
            ok: boolean; error?: string; description?: string;
            clickPoint?: { x: number; y: number };
            verification?: { before: unknown; targetSelector: string | null };
          }>(buildClickScript(resolved.selector), signal);

          if (!result.ok) return buildError('click', result.error ?? 'Failed to click the requested element.');
          if (!result.clickPoint) return buildError('click', 'Could not determine where to click on the page.');

          // Dispatch mouse events via CDP Input domain
          await tab.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: result.clickPoint.x, y: result.clickPoint.y,
          });
          await tab.cdp.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', x: result.clickPoint.x, y: result.clickPoint.y,
            button: 'left', clickCount: 1,
          });
          await tab.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x: result.clickPoint.x, y: result.clickPoint.y,
            button: 'left', clickCount: 1,
          });

          this.invalidateSnapshot(tab);
          await this.waitForSettle(tab, signal);

          // Verify click changed the page
          if (result.verification) {
            const verification = await this.executeOnActiveTab<{ changed: boolean; reasons: string[] }>(
              buildVerifyClickScript(result.verification.targetSelector, result.verification.before), signal, { waitForReady: false },
            );
            if (!verification.changed) {
              return buildError('click', 'Click did not change the page state. Target may not be the correct control.');
            }
          }

          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('click', result.description ? `Clicked ${result.description}.` : 'Clicked the requested element.', page);
        }

        case 'type': {
          if (input.text === undefined) return buildError('type', 'text is required for type.');
          const tab = this.getActiveTab();
          if (!tab) return buildError('type', 'No active browser tab is open.');
          const resolved = this.resolveElementSelector(tab, { index: input.index, selector: input.selector, snapshotId: input.snapshotId });
          if (!resolved.ok || !resolved.selector) return buildError('type', resolved.error ?? 'Failed to resolve element.');

          const result = await this.executeOnActiveTab<{ ok: boolean; error?: string; description?: string }>(
            buildTypeScript(resolved.selector, input.text), signal,
          );
          if (!result.ok) return buildError('type', result.error ?? 'Failed to type into the requested element.');
          this.invalidateSnapshot(tab);
          await this.waitForSettle(tab, signal);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('type', result.description ? `Typed into ${result.description}.` : 'Typed into the requested element.', page);
        }

        case 'press': {
          if (!input.key) return buildError('press', 'key is required for press.');
          const tab = this.getActiveTab();
          if (!tab) return buildError('press', 'No active browser tab is open.');

          let description = 'active element';
          if (input.index != null || input.selector?.trim()) {
            const resolved = this.resolveElementSelector(tab, { index: input.index, selector: input.selector, snapshotId: input.snapshotId });
            if (!resolved.ok || !resolved.selector) return buildError('press', resolved.error ?? 'Failed to resolve element.');
            const focusResult = await this.executeOnActiveTab<{ ok: boolean; error?: string; description?: string }>(
              buildFocusScript(resolved.selector), signal,
            );
            if (!focusResult.ok) return buildError('press', focusResult.error ?? 'Failed to focus the element.');
            description = focusResult.description ?? description;
          }

          const keyCode = normalizeKeyCode(input.key);
          // CDP expects key events as rawKey, code, key, text, etc.
          // Simple approach: map common keys to their CDP equivalents
          const cdpKey = this.mapKeyToCDP(keyCode);
          await tab.cdp.send('Input.dispatchKeyEvent', {
            type: 'keyDown', ...cdpKey,
          });
          if (keyCode.length === 1) {
            await tab.cdp.send('Input.dispatchKeyEvent', {
              type: 'char', ...cdpKey,
            });
          }
          await tab.cdp.send('Input.dispatchKeyEvent', {
            type: 'keyUp', ...cdpKey,
          });

          this.invalidateSnapshot(tab);
          await this.waitForSettle(tab, signal);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('press', `Pressed ${keyCode} on ${description}.`, page);
        }

        case 'scroll': {
          const tab = this.getActiveTab();
          if (!tab) return buildError('scroll', 'No active browser tab is open.');
          const offset = Math.max(1, input.amount ?? 700) * (input.direction === 'up' ? -1 : 1);
          const result = await this.executeOnActiveTab<{ ok: boolean; error?: string }>(buildScrollScript(offset), signal);
          if (!result.ok) return buildError('scroll', result.error ?? 'Failed to scroll the page.');
          this.invalidateSnapshot(tab);
          await new Promise((r) => setTimeout(r, 250));
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('scroll', `Scrolled ${input.direction ?? 'down'}.`, page);
        }

        case 'wait': {
          const tab = this.getActiveTab();
          if (!tab) return buildError('wait', 'No active browser tab is open.');
          const duration = input.ms ?? 1000;
          await new Promise((r) => setTimeout(r, duration));
          await this.waitForSettle(tab, signal);
          const page = await this.readPageSummary(tab, signal, { waitForReady: false }) ?? undefined;
          return buildSuccess('wait', `Waited ${duration}ms for the page to settle.`, page);
        }
      }
    } catch (error) {
      const action = (input.action || 'unknown') as BrowserControlAction;
      return {
        success: false, action,
        error: error instanceof Error ? error.message : 'Browser control failed unexpectedly.',
        browser: this.getState(),
      };
    }

    return {
      success: false,
      action: input.action as BrowserControlAction,
      error: 'Unknown action.',
      browser: this.getState(),
    };
  }

  private mapKeyToCDP(key: string): { key: string; code: string; text?: string; windowsVirtualKeyCode?: number } {
    const keyMap: Record<string, { key: string; code: string; windowsVirtualKeyCode?: number }> = {
      'Enter': { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      'Tab': { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      'Escape': { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
      'Backspace': { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
      'Delete': { key: 'Delete', code: 'Delete', windowsVirtualKeyCode: 46 },
      'Space': { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 },
      'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
      'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
      'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
      'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
    };
    const mapped = keyMap[key];
    if (mapped) return mapped;
    if (key.length === 1) return { key, code: `Key${key.toUpperCase()}`, text: key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) };
    return { key, code: key };
  }

  // ── Screencast streaming ───────────────────────────────────────
  // CDP Page.startScreencast sends JPEG frames as base64.
  // We forward them to subscribed WS clients.

  private screencastActive = false;
  private screencastFormat = 'jpeg';
  private screencastQuality = 60;
  private screencastMaxWidth = 1280;
  private screencastMaxHeight = 800;
  private screencastInterval = 100; // ms between frames minimum

  addScreencastClient(ws: WebSocket): void {
    this.screencastClients.add(ws);
    this.startScreencast();
  }

  removeScreencastClient(ws: WebSocket): void {
    this.screencastClients.delete(ws);
    if (this.screencastClients.size === 0) {
      this.stopScreencast();
    }
  }

  private async startScreencast(): Promise<void> {
    if (this.screencastActive) return;
    const tab = this.getActiveTab();
    if (!tab) {
      console.log('[cdp-browser] No active tab to start screencast');
      return;
    }

    this.screencastActive = true;
    console.log('[cdp-browser] Starting screencast for tab', tab.id);

    // Enable Page domain to receive screencast events
    try { await tab.cdp.send('Page.enable'); } catch {}

    // Remove any old screencast frame listeners to avoid duplicates
    tab.cdp.removeAllListeners('Page.screencastFrame');

    tab.cdp.on('Page.screencastFrame', async (params: any) => {
      console.log('[cdp-browser] Screencast frame received from CDP! dataLen=' + (params.data?.length || 0) + ' clients=' + this.screencastClients.size);
      // Forward frame to all subscribed clients as a data URL
      const dataUrl = `data:image/jpeg;base64,${params.data}`;
      const frame = {
        type: 'browser:screencast:frame',
        data: dataUrl,
      };

      for (const client of Array.from(this.screencastClients)) {
        if (client.readyState === 1) { // OPEN
          try {
            client.send(JSON.stringify(frame));
          } catch (e) {
            console.error('[cdp-browser] Error sending screencast frame:', e);
          }
        }
      }

      // Acknowledge the frame so CDP sends the next one
      if (params.sessionId) {
        try {
          await tab.cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
        } catch {}
      }
    });

    try {
      await tab.cdp.send('Page.startScreencast', {
        format: this.screencastFormat,
        quality: this.screencastQuality,
        maxWidth: this.screencastMaxWidth,
        maxHeight: this.screencastMaxHeight,
        maxFramesPerSecond: 30,
      });
      console.log('[cdp-browser] Screencast started successfully');
    } catch (e) {
      console.error('[cdp-browser] Failed to start screencast:', e);
      this.screencastActive = false;
    }
  }

  private async stopScreencast(): Promise<void> {
    if (!this.screencastActive) return;
    this.screencastActive = false;
    const tab = this.getActiveTab();
    if (tab) {
      try { await tab.cdp.send('Page.stopScreencast'); } catch {}
    }
    console.log('[cdp-browser] Stopped screencast');
  }

  // ── Input forwarding (from client → CDP) ──────────────────────
  // Called when a WS client sends mouse/keyboard input events.

  async handleInputEvent(ws: WebSocket, event: any): Promise<void> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return;

    try {
      switch (event.type) {
        case 'mousePressed':
        case 'mouseReleased': {
          await tab.cdp.send('Input.dispatchMouseEvent', {
            type: event.type,
            x: event.x, y: event.y,
            button: event.button || 'left',
            clickCount: event.clickCount || 1,
          });
          break;
        }
        case 'mouseMoved': {
          await tab.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', x: event.x, y: event.y,
          });
          break;
        }
        case 'mouseWheel': {
          await tab.cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x: event.x, y: event.y,
            deltaX: event.deltaX || 0, deltaY: event.deltaY || 0,
          });
          break;
        }
        case 'keyDown':
        case 'keyUp': {
          const cdpKey = this.mapKeyToCDP(event.key);
          await tab.cdp.send('Input.dispatchKeyEvent', {
            type: event.type,
            ...cdpKey,
          });
          break;
        }
        case 'char': {
          const cdpKey = this.mapKeyToCDP(event.key);
          await tab.cdp.send('Input.dispatchKeyEvent', {
            type: 'char', ...cdpKey,
          });
          break;
        }
      }
    } catch (e) {
      console.error('[cdp-browser] Input event error:', e);
    }
  }

  // ── Public state for WS broadcast ──────────────────────────────

  getBrowserState(): BrowserState {
    return this.getState();
  }

  // ── Tab management for WS IPC (browser:* channels) ─────────────

  async newTab(url?: string): Promise<{ ok: boolean; tabId?: string; error?: string }> {
    try {
      await this.start();
      const target = url?.trim() ? normalizeNavigationTarget(url) : HOME_URL;
      const { targetId } = await this.browserCdp!.send('Target.createTarget', { url: target });
      await new Promise((r) => setTimeout(r, 500));
      if (!this.tabs.has(targetId)) {
        await this.attachTarget({ targetId, type: 'page', url: target, title: '', webSocketDebuggerUrl: '' });
      }
      // Set new tab as active
      this.activeTabId = this.tabs.has(targetId) ? targetId : (this.tabOrder[this.tabOrder.length - 1] ?? null);

      // Restart screencast for the new active tab
      if (this.screencastClients.size > 0) {
        if (this.screencastActive) {
          const oldTab = this.tabs.get(this.tabOrder[0] ?? '');
          if (oldTab) { try { await oldTab.cdp.send('Page.stopScreencast'); } catch {} }
          this.screencastActive = false;
        }
        await this.startScreencast();
      }

      return { ok: true, tabId: this.activeTabId! };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async switchTab(tabId: string): Promise<{ ok: boolean }> {
    const tab = this.tabs.get(tabId);
    if (!tab) return { ok: false };

    // Stop screencast on the old tab
    if (this.screencastActive) {
      const oldTab = this.getActiveTab();
      if (oldTab && oldTab.id !== tabId) {
        try { await oldTab.cdp.send('Page.stopScreencast'); } catch {}
        this.screencastActive = false;
      }
    }

    this.activeTabId = tabId;

    // Activate the target in Chromium
    try {
      await this.browserCdp?.send('Target.activateTarget', { targetId: tab.targetId });
    } catch {}

    // Restart screencast for the new active tab
    if (this.screencastClients.size > 0) {
      this.screencastActive = false; // allow restart
      await this.startScreencast();
    }

    return { ok: true };
  }

  closeTab(tabId: string): { ok: boolean } {
    const tab = this.tabs.get(tabId);
    if (!tab) return { ok: false };
    if (this.tabOrder.length <= 1) return { ok: false };
    const closingIndex = this.tabOrder.indexOf(tabId);
    this.activeTabId = this.activeTabId === tabId
      ? (this.tabOrder[closingIndex + 1] ?? this.tabOrder[closingIndex - 1] ?? null)
      : this.activeTabId;
    try { this.browserCdp?.send('Target.closeTarget', { targetId: tab.targetId }); } catch {}
    tab.cdp.close();
    this.tabs.delete(tabId);
    this.tabOrder = this.tabOrder.filter((id) => id !== tabId);
    return { ok: true };
  }

  async navigate(url: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.start();
      const target = normalizeNavigationTarget(url);
      let tab = this.getActiveTab() ?? this.ensureInitialTab();
      if (!tab) {
        await this.newTab(HOME_URL);
        tab = this.getActiveTab();
      }
      if (!tab) return { ok: false, error: 'No browser tab is open.' };
      this.invalidateSnapshot(tab);
      tab.loading = true;
      await tab.cdp.send('Page.navigate', { url: target });
      await this.waitForSettle(tab);
      await this.updateTabInfo(tab);

      // Restart screencast for the navigated tab if clients are waiting
      if (this.screencastClients.size > 0) {
        // Stop old screencast on this tab first
        try { await tab.cdp.send('Page.stopScreencast'); } catch {}
        this.screencastActive = false;
        await this.startScreencast();
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Detect whether the current page looks like a login wall.
   * Checks URL patterns, page title, and form elements.
   * Returns { needsLogin: true, loginUrl, domain } if detected.
   */
  async detectLoginWall(): Promise<{
    needsLogin: boolean;
    loginUrl?: string;
    domain?: string;
    reason?: string;
  }> {
    try {
      await this.start();
      const tab = this.getActiveTab();
      if (!tab) return { needsLogin: false };

      const url = tab.url || '';
      let domain = '';
      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}

      // 1. Check URL patterns that strongly indicate login pages
      const loginUrlPatterns = [
        /\/login/i, /\/signin/i, /\/sign-in/i, /\/auth/i,
        /\/accounts\/ServiceLogin/i, /\/oauth/i, /\/authorize/i,
        /\/session/i, /\/idp\//i,
      ];
      const isLoginUrl = loginUrlPatterns.some((p) => p.test(url));

      // 2. Check page title for login indicators
      const title = (tab.title || '').toLowerCase();
      const loginTitlePatterns = [
        'sign in', 'log in', 'login', 'authorize', 'verify your identity',
        'sign-in', 'account login',
      ];
      const isLoginTitle = loginTitlePatterns.some((p) => title.includes(p));

      // 3. Check page content for login form elements
      let hasLoginForm = false;
      try {
        const result = await tab.cdp.send('Runtime.evaluate', {
          expression: `(() => {
            const pwd = document.querySelector('input[type="password"]');
            const email = document.querySelector('input[type="email"]');
            const user = document.querySelector('input[name*="user" i], input[name*="email" i], input[name*="login" i]');
            const btn = document.querySelector('button[type="submit"], input[type="submit"]');
            return !!(pwd && (email || user) && btn);
          })()`,
          returnByValue: true,
        });
        hasLoginForm = result?.result?.value === true;
      } catch {}

      const needsLogin = isLoginUrl || isLoginTitle || hasLoginForm;
      const reason = isLoginUrl
        ? 'Login page detected (URL pattern)'
        : isLoginTitle
          ? `Login page detected (title: "${tab.title}")`
          : hasLoginForm
            ? 'Login form detected on page'
            : '';

      return { needsLogin, loginUrl: url, domain, reason };
    } catch {
      return { needsLogin: false };
    }
  }

  async back(): Promise<{ ok: boolean }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false };
    this.invalidateSnapshot(tab);
    await tab.cdp.send('Runtime.evaluate', { expression: 'history.back()' });
    await this.waitForSettle(tab);
    await this.updateTabInfo(tab);
    return { ok: true };
  }

  async forward(): Promise<{ ok: boolean }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false };
    this.invalidateSnapshot(tab);
    await tab.cdp.send('Runtime.evaluate', { expression: 'history.forward()' });
    await this.waitForSettle(tab);
    await this.updateTabInfo(tab);
    return { ok: true };
  }

  async reload(): Promise<{ ok: boolean }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false };
    this.invalidateSnapshot(tab);
    tab.loading = true;
    await tab.cdp.send('Page.reload');
    await this.waitForSettle(tab);
    return { ok: true };
  }

  // ── Cookie management (for session persistence) ────────────────

  async getCookies(urls?: string[]): Promise<{ cookies: any[] }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { cookies: [] };
    const params: any = {};
    if (urls && urls.length > 0) params.urls = urls;
    const result = await tab.cdp.send('Network.getCookies', params);
    return { cookies: result.cookies || [] };
  }

  async setCookies(cookies: any[]): Promise<{ ok: boolean }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false };
    for (const cookie of cookies) {
      try {
        await tab.cdp.send('Network.setCookie', {
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'Lax',
          expires: cookie.expires || undefined,
          ...(cookie.sameSite === 'None' ? {} : {}),
        });
      } catch (e) {
        console.error('[cdp-browser] setCookie error:', e);
      }
    }
    return { ok: true };
  }

  async clearCookies(): Promise<{ ok: boolean }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false };
    await tab.cdp.send('Network.clearBrowserCookies');
    return { ok: true };
  }

  async clearSiteCookies(domain: string): Promise<{ ok: boolean; deleted?: number }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false };
    // Get all cookies, then delete only the ones matching the domain
    const result = await tab.cdp.send('Network.getCookies', { urls: [`https://${domain}`, `http://${domain}`] });
    const cookies = result.cookies || [];
    for (const cookie of cookies) {
      try {
        await tab.cdp.send('Network.deleteCookies', {
          name: cookie.name,
          domain: cookie.domain,
          path: cookie.path || '/',
        });
      } catch (e) {
        console.error('[cdp-browser] deleteCookie error:', e);
      }
    }
    return { ok: true, deleted: cookies.length };
  }

  async executeScript(expression: string): Promise<{ ok: boolean; result?: any; error?: string }> {
    await this.start();
    const tab = this.getActiveTab();
    if (!tab) return { ok: false, error: 'No browser tab is open.' };
    try {
      const result = await tab.cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        return { ok: false, error: result.exceptionDetails.text || 'Script execution error' };
      }
      return { ok: true, result: result.result?.value };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
