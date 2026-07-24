import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'path';
import { homedir } from 'os';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createHmac, timingSafeEqual } from 'crypto';
import { WorkDir } from '@x/core/dist/config/config.js';
import { initConfigs } from '@x/core/dist/config/initConfigs.js';
import container from '@x/core/dist/di/container.js';
import { asClass, asValue } from 'awilix';
import { ipc as ipcShared } from '@x/shared';
import { z } from 'zod';

// Set ROWBOAT_WORKDIR to ~/.divinity for the workspace
process.env.ROWBOAT_WORKDIR = resolve(homedir(), '.divinity');

// Initialize configs before using the container
initConfigs();

// Import all the core functions — real direct-path imports matching apps/main/src/ipc.ts
import { workspace, versionHistory, voice } from '@x/core';
import * as runsCore from '@x/core/dist/runtime/legacy/runs.js';
import { bus } from '@x/core/dist/runtime/legacy/bus.js';
import { serviceBus } from '@x/core/dist/services/service_bus.js';
import { listOnboardingModels } from '@x/core/dist/models/models-dev.js';
import { testModelConnection, listModelsForProvider, generateOneShot } from '@x/core/dist/models/models.js';
import { getDefaultModelAndProvider } from '@x/core/dist/models/defaults.js';
import { isSignedIn } from '@x/core/dist/account/account.js';
import { listGatewayModels } from '@x/core/dist/models/gateway.js';
import { invalidateCopilotInstructionsCache } from '@x/core/dist/runtime/assembly/copilot/instructions.js';
import { triggerSync as triggerGranolaSync } from '@x/core/dist/knowledge/granola/sync.js';
import { syncSlackKnowledgeSources, triggerSync as triggerSlackKnowledgeSync, getSlackKnowledgeSyncStatus } from '@x/core/dist/knowledge/sources/sync_slack.js';
import { isOnboardingComplete, markOnboardingComplete } from '@x/core/dist/config/note_creation_config.js';
import { loadNotificationSettings, saveNotificationSettings } from '@x/core/dist/config/notification_config.js';
import * as appsIndexer from '@x/core/dist/apps/indexer.js';
import * as appsServer from '@x/core/dist/apps/server.js';
import * as appsAgents from '@x/core/dist/apps/agents.js';
import * as githubAuth from '@x/core/dist/apps/github-auth.js';
import * as appsStars from '@x/core/dist/apps/stars.js';
import * as appsInstaller from '@x/core/dist/apps/installer.js';
import { registryClient } from '@x/core/dist/apps/registry.js';
import * as appsPublisher from '@x/core/dist/apps/publisher.js';
import { runAgentSlack, getAgentSlackCliStatus, AgentSlackRunError } from '@x/core/dist/slack/agent-slack-exec.js';
import { knowledgeSourcesRepo } from '@x/core/dist/knowledge/sources/repo.js';
import { rankSlackHomeMessages } from '@x/core/dist/knowledge/sources/rank_slack_home.js';
import { applyChannelsConfig, getChannelsStatus, logoutWhatsApp } from '@x/core/dist/channels/service.js';
import { ensureEngine } from '@x/core/dist/code-mode/acp/engine-provisioner.js';
import { checkCodeModeAgentStatus } from '@x/core/dist/code-mode/status.js';
import { search } from '@x/core/dist/search/search.js';
import { resolveMeetingPrep } from '@x/core/dist/knowledge/meeting_prep.js';
import { readPrepNoteForEvent } from '@x/core/dist/knowledge/meeting_prep_brief.js';
import { classifySchedule, processRowboatInstruction } from '@x/core/dist/knowledge/inline_tasks.js';
import { getBillingInfo } from '@x/core/dist/billing/billing.js';
import { summarizeMeeting } from '@x/core/dist/knowledge/summarize_meeting.js';
import { getAccessToken } from '@x/core/dist/auth/tokens.js';
import { getRowboatConfig } from '@x/core/dist/config/rowboat.js';
import { runLiveNoteAgent } from '@x/core/dist/knowledge/live-note/runner.js';
import {
  listImportantThreads,
  listEverythingElseThreads,
  saveMessageBodyHeight,
  triggerSync as triggerGmailSync,
  sendThreadReply,
  saveThreadDraft,
  deleteThreadDraft,
  listDraftThreads,
  searchThreads,
  archiveThread,
  trashThread,
  markThreadRead,
  downloadAttachment,
  getAccountEmail,
  getAccountName,
  getConnectionStatus as getGmailConnectionStatus,
  setThreadImportance,
} from '@x/core/dist/knowledge/sync_gmail.js';
import { searchContacts as searchGmailContacts } from '@x/core/dist/knowledge/gmail_contacts.js';
import { searchSentContacts } from '@x/core/dist/knowledge/gmail_sent_contacts.js';
import {
  getGoogleDocsConnectionStatus,
  importGoogleDoc,
  syncGoogleDocDown,
  syncGoogleDocUp,
  getGoogleDocLink,
} from '@x/core/dist/knowledge/google_docs.js';
import { liveNoteBus } from '@x/core/dist/knowledge/live-note/bus.js';
import { getInstallationId } from '@x/core/dist/analytics/installation.js';
import { API_URL } from '@x/core/dist/config/env.js';
import {
  fetchLiveNote,
  setLiveNote,
  setLiveNoteActive,
  deleteLiveNote,
  listLiveNotes,
} from '@x/core/dist/knowledge/live-note/fileops.js';
import { runBackgroundTask } from '@x/core/dist/background-tasks/runner.js';
import { backgroundTaskBus } from '@x/core/dist/background-tasks/bus.js';
import {
  fetchTask,
  patchTask,
  createTask,
  deleteTask,
  listTasks,
  readRunIds as readTaskRunIds,
} from '@x/core/dist/background-tasks/fileops.js';
import { triggerRun as triggerAgentScheduleRun } from '@x/core/dist/agent-schedule/runner.js';

// Type-only imports
import type { ISessions, EmitterSessionBus as SessionBusType } from '@x/core/dist/runtime/sessions/index.js';
import type { ITurnEventBus as TurnEventBusType } from '@x/core/dist/runtime/turns/event-hub.js';
import type { CodeRunFeed } from '@x/core/dist/code-mode/feed.js';
import type { CodeSession } from '@x/shared/dist/code-sessions.js';
import { isDurableTurnEvent } from '@x/shared/dist/turns.js';

// ── Web-mode auth override ─────────────────────────────────────────
// In web mode, auth comes from the SaaS JWT passed via WebSocket subprotocol.
// The Electron-era oauth.json file is irrelevant. We override the DI
// container's oauthRepo so that all @x/core functions (getAccessToken,
// isSignedIn, getBillingInfo, listGatewayModels, etc.) use the JWT instead
// of reading from disk.
//
// Since the bridge is single-process and each WebSocket message includes
// the ws instance, we use a per-message token lookup. For functions called
// outside a message handler (e.g. getRowboatConfig cache), we fall back to
// the most recently active token.

// Map of WebSocket → JWT (same as clientAuthTokens, but accessible to overrides)
const webTokens = new Map<WebSocket, string>();
let activeToken: string | null = null; // most recently seen token

// WebOAuthRepo — replaces FSOAuthRepo. Returns JWT from WebSocket
// connection instead of reading oauth.json from disk.
class WebOAuthRepo {
  async read(provider: string) {
    if (provider === 'rowboat' && activeToken) {
      // Decode JWT to get expiry
      let expiresAt = Math.floor(Date.now() / 1000) + 3600;
      try {
        const payload = JSON.parse(Buffer.from(activeToken.split('.')[1], 'base64url').toString('utf8'));
        expiresAt = payload.exp ?? expiresAt;
      } catch {}
      return {
        tokens: {
          access_token: activeToken,
          refresh_token: null,
          expires_at: expiresAt,
          token_type: 'Bearer',
          scopes: [],
        },
        mode: 'rowboat',
      };
    }
    return {};
  }
  async upsert() { /* no-op — web mode doesn't persist to disk */ }
  async delete() { /* no-op */ }
  async getClientFacingConfig() {
    if (activeToken) {
      return {
        rowboat: { connected: true, error: null, clientId: null },
      };
    }
    return {};
  }
}

// Replace the FSOAuthRepo with our web version
container.register({
  oauthRepo: asClass(WebOAuthRepo).singleton(),
});

// Stub implementations for functions that live in main/ local files (not in @x/core).
// These are Electron-dependent; the web-bridge stubs them out.
// Note: 'rowboat' provider is handled separately above (JWT-based).
async function connectProvider(_provider: string, _credentials?: { clientId: string; clientSecret: string }) {
  return { error: 'not_implemented' };
}
async function disconnectProvider(_provider: string) {
  return { error: 'not_implemented' };
}
function listProviders() {
  return [];
}
async function startManagedGooglePick(_targetFolder: string) {
  return { error: 'not_implemented' };
}
function consumePendingDeepLink() {
  return null;
}

// Local helper functions defined in ipc.ts (not exported from @x/core).
// Copied here so the Slack handlers work without modification.
function parseWhoamiWorkspaces(data: unknown): Array<{ url: string; name: string }> {
  const parsed = (data ?? {}) as { workspaces?: Array<{ workspace_url?: string; workspace_name?: string }> };
  return (parsed.workspaces || []).map((w) => ({
    url: w.workspace_url || '',
    name: w.workspace_name || '',
  }));
}

function extractArrayPayload(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['messages', 'channels', 'items', 'results', 'data']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

function slackMessageText(message: Record<string, unknown>): string {
  const value = message.text ?? message.body ?? message.content;
  return typeof value === 'string' ? value.trim() : '';
}

function slackMessageAuthor(message: Record<string, unknown>): string | undefined {
  const value = message.username ?? message.user ?? message.author;
  return typeof value === 'string' ? value : undefined;
}

function extractSlackUserName(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const profile = obj.profile && typeof obj.profile === 'object' ? obj.profile as Record<string, unknown> : undefined;
  const user = obj.user && typeof obj.user === 'object' ? obj.user as Record<string, unknown> : undefined;
  const userProfile = user?.profile && typeof user.profile === 'object' ? user.profile as Record<string, unknown> : undefined;
  const candidates = [
    profile?.display_name, profile?.real_name,
    userProfile?.display_name, userProfile?.real_name,
    obj.display_name, obj.displayName, obj.real_name, obj.realName,
    user?.display_name, user?.displayName, user?.real_name, user?.realName,
    obj.name, user?.name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

async function resolveSlackUserName(
  userId: string,
  workspaceUrl: string | undefined,
  cache: Map<string, string>,
): Promise<string | null> {
  const key = `${workspaceUrl ?? ''}:${userId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const args = ['user', 'get', userId];
  if (workspaceUrl) args.push('--workspace', workspaceUrl);
  const result = await runAgentSlack(args, { timeoutMs: 10000, maxBuffer: 512 * 1024 });
  if (result.ok) {
    const name = extractSlackUserName(result.data ?? {});
    if (name) { cache.set(key, name); return name; }
  } else {
    console.warn(`[Slack] Failed to resolve user ${userId}: ${result.message}`);
  }
  cache.set(key, userId);
  return null;
}

async function resolveSlackMessageText(
  text: string,
  workspaceUrl: string | undefined,
  cache: Map<string, string>,
): Promise<string> {
  const matches = Array.from(text.matchAll(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>|@([UW][A-Z0-9]{6,})\b/g));
  if (matches.length === 0) return text;
  let resolved = text;
  for (const match of matches) {
    const userId = match[1] ?? match[3];
    if (!userId) continue;
    const fallback = match[2] ?? match[0];
    const name = await resolveSlackUserName(userId, workspaceUrl, cache);
    resolved = resolved.replaceAll(match[0], name ?? fallback);
  }
  return resolved;
}

async function resolveSlackAuthor(
  author: string | undefined,
  workspaceUrl: string | undefined,
  cache: Map<string, string>,
): Promise<string | undefined> {
  if (!author) return undefined;
  if (!/^[UW][A-Z0-9]{6,}$/.test(author)) return author;
  return await resolveSlackUserName(author, workspaceUrl, cache) ?? author;
}

function slackMessageUrl(message: Record<string, unknown>, workspaceUrl: string | undefined, channelId: string | undefined, ts: string): string | undefined {
  const direct = message.permalink ?? message.url;
  if (typeof direct === 'string' && direct) return direct;
  if (!workspaceUrl || !channelId) return undefined;
  return `${workspaceUrl.replace(/\/$/, '')}/archives/${channelId}/p${ts.replace('.', '')}`;
}

// Stub Electron APIs
const electronStubs = {
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: '' }),
  },
  shell: {
    openPath: async () => '',
    openExternal: async () => {},
    showItemInFolder: async () => {},
  },
  systemPreferences: {
    getMediaAccessStatus: () => 'granted',
    askForMediaAccess: async () => true,
  },
  desktopCapturer: {
    getSources: async () => [],
  },
  powerSaveBlocker: {
    start: () => 1,
    stop: () => {},
    isStarted: () => false,
  },
  autoUpdater: {
    checkForUpdates: async () => {},
    quitAndInstall: () => {},
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  app: {
    getVersion: () => '0.1.0',
    isPackaged: false,
    getApplicationName: () => 'Divinity Works',
  },
};

// HTTP + WebSocket server setup
import { createServer } from 'http';
import { extname, join } from 'path';
import { readFile, stat } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RENDERER_DIST = resolve(__dirname, '../renderer/dist-web');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

// ── Server-side auth gate ──────────────────────────────────────────
// Full HS256 JWT signature verification using Node's crypto module.
// The JWT_SECRET is shared with the Cloudflare Worker that issues tokens.
const JWT_SECRET = process.env.JWT_SECRET || '';

function isTokenValid(token: string): boolean {
  if (!JWT_SECRET) {
    // Fallback: if no secret configured, only check expiry (dev mode)
    try {
      const parts = token.split('.');
      if (parts.length < 2) return false;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (payload.exp && Date.now() >= payload.exp * 1000) return false;
      return true;
    } catch {
      return false;
    }
  }
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = Buffer.from(sigB64, 'base64url');
    const expectedSig = createHmac('sha256', JWT_SECRET).update(signingInput).digest();
    if (sig.length !== expectedSig.length) return false;
    if (!timingSafeEqual(sig, expectedSig)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp && Date.now() >= payload.exp * 1000) return false;
    if (payload.type && payload.type !== 'access') return false;
    return true;
  } catch {
    return false;
  }
}

// Decode JWT payload (without verification — used for extracting user info)
function decodeJwtPayload(token: string): { sub?: string; email?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch {
    return null;
  }
}

// HTML served to unauthenticated visitors — matches dashboard sign-in page branding
const SIGN_IN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in — Divinity Works</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #ffffff;
      --bg-soft: #fafafa;
      --border: #ececef;
      --border-strong: #d4d4d8;
      --text: #0a0a0a;
      --muted: #525258;
      --muted-soft: #71717a;
      --radius: 10px;
      --ease: cubic-bezier(0.16, 1, 0.3, 1);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg); color: var(--text);
      line-height: 1.5; letter-spacing: -0.012em;
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }
    .auth-page { display: flex; flex-direction: column; min-height: 100vh; }
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
    .logo img { width: 100%; height: 100%; border-radius: 14px; }
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
</head>
<body>
  <div class="auth-page">
    <header class="nav">
      <div class="nav__inner">
        <a class="brand" href="https://divinityworks.space" aria-label="Divinity Works">
          <img class="brand__mark" src="data:image/png;base64,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" alt="Divinity" />
          <span>Divinity<span class="brand__sub">Works</span></span>
        </a>
        <nav class="nav__links">
          <a href="https://divinityworks.space">Home</a>
        </nav>
      </div>
    </header>
    <main class="main">
      <div class="card">
        <div class="logo"><img src="data:image/png;base64,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" alt="Divinity" width="64" height="64" /></div>
        <h1>Sign in to Divinity</h1>
        <p>Use your Google account to continue.</p>
        <a id="google-btn" href="https://dash.divinityworks.space/signin" class="google-btn">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </a>
      </div>
    </main>
    <footer class="footer">Divinity Works — Your AI coworker with a real memory.</footer>
  </div>
</body>
</html>`;

const httpServer = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check — always accessible (used by Cloudflare Tunnel)
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  // ── AUTH GATE ───────────────────────────────────────────────────
  // Every request must pass auth. No token = redirect to sign-in page.
  // Token in URL is consumed by web-preload.ts (saved to localStorage,
  // URL cleaned). Subsequent requests use cookie.
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const urlToken = url.searchParams.get('token') || url.searchParams.get('access_token');
  const cookieToken = (req.headers['cookie'] || '').match(/dw_access_token=([^;]+)/)?.[1];
  const bearerToken = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const token = urlToken || cookieToken || bearerToken || null;

  if (!token || !isTokenValid(token)) {
    // Check if this is a static asset request (JS, CSS, fonts, images)
    // These are only served to authenticated users. Without auth, deny.
    const reqPath = (req.url || '/').split('?')[0];
    const ext = extname(reqPath).toLowerCase();

    // If it's the HTML page request, serve the sign-in redirect page
    if (reqPath === '/' || ext === '.html' || ext === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SIGN_IN_HTML);
      return;
    }

    // For assets (JS/CSS/fonts) without auth — 401
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized — please sign in at dash.divinityworks.space/signin');
    return;
  }

  // ── AUTHENTICATED — serve files ─────────────────────────────────
  // If token came from URL, set a cookie so subsequent asset requests
  // (JS, CSS, fonts) are automatically authenticated.
  if (urlToken) {
    res.setHeader('Set-Cookie', `dw_access_token=${urlToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  }

  let urlPath = req.url?.split('?')[0] || '/';
  if (urlPath === '/') urlPath = '/web.html';

  const filePath = join(RENDERER_DIST, urlPath);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const data = await readFile(filePath);
      // No caching — always serve fresh files
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(data);
      return;
    }
  } catch (e) {
    // File not found — fall through to SPA fallback
  }

  // SPA fallback: serve web.html for unknown routes
  try {
    const fallbackPath = join(RENDERER_DIST, 'web.html');
    const data = await readFile(fallbackPath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

httpServer.listen(8790, () => {
  console.log('Divinity web bridge listening on http://localhost:8790');
  console.log('  Static files: ' + RENDERER_DIST);
  console.log('  WebSocket: ws://localhost:8790/ws');
});

// Store connected clients and subscriptions
const clients = new Set<WebSocket>();
const subscriptions = new Map<string, Set<WebSocket>>(); // channel -> Set<WebSocket>

// Broadcast to all connected clients
function broadcastToClients(channel: string, payload: unknown): void {
  const message = JSON.stringify({
    type: 'event',
    channel,
    data: payload,
  });
  
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error(`Error broadcasting to client: ${error}`);
      }
    }
  }
}

// Broadcast to subscribed clients only
function broadcastToSubscribers(channel: string, payload: unknown): void {
  const subscribers = subscriptions.get(channel);
  if (!subscribers || subscribers.size === 0) return;
  
  const message = JSON.stringify({
    type: 'event',
    channel,
    data: payload,
  });
  
  for (const client of subscribers) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error(`Error broadcasting to subscriber: ${error}`);
      }
    }
  }
}

// Subscribe a client to a channel
function subscribeClient(client: WebSocket, channel: string): void {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel)!.add(client);
}

// Unsubscribe a client from a channel
function unsubscribeClient(client: WebSocket, channel: string): void {
  const subscribers = subscriptions.get(channel);
  if (subscribers) {
    subscribers.delete(client);
    if (subscribers.size === 0) {
      subscriptions.delete(channel);
    }
  }
}

// Handle incoming WebSocket messages
// Extract auth token from WebSocket subprotocol (passed by web-preload shim)
const clientAuthTokens = new Map<WebSocket, string>();

wss.on('connection', (ws: WebSocket, req: any) => {
  // Read auth token from subprotocol: ['bearer', '<token>']
  let authToken = '';
  if (req.headers['sec-websocket-protocol']) {
    const protocols = req.headers['sec-websocket-protocol'].split(',').map((s: string) => s.trim());
    if (protocols[0] === 'bearer' && protocols[1]) {
      authToken = protocols[1];
    }
  }
  if (authToken) {
    clientAuthTokens.set(ws, authToken);
    webTokens.set(ws, authToken);
    activeToken = authToken; // set as active for non-request-scoped calls
  }

  console.log('New client connected', authToken ? '(authenticated)' : '(anonymous)');
  clients.add(ws);
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      // Set active token for this request's scope so @x/core functions
      // (getAccessToken, isSignedIn, getBillingInfo, etc.) can use it
      const wsToken = webTokens.get(ws);
      if (wsToken) activeToken = wsToken;
      
      if (message.type === 'invoke') {
        handleInvoke(ws, message);
      } else if (message.type === 'subscribe') {
        subscribeClient(ws, message.channel);
        ws.send(JSON.stringify({
          type: 'response',
          reqId: message.reqId,
          result: { success: true }
        }));
      } else if (message.type === 'unsubscribe') {
        unsubscribeClient(ws, message.channel);
        ws.send(JSON.stringify({
          type: 'response',
          reqId: message.reqId,
          result: { success: true }
        }));
      }
    } catch (error) {
      console.error(`Error processing message: ${error}`);
      ws.send(JSON.stringify({
        type: 'error',
        reqId: 'unknown',
        error: `Invalid message format: ${error}`
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
    clientAuthTokens.delete(ws);
    webTokens.delete(ws);
    
    // Clean up subscriptions
    for (const [channel, subscribers] of subscriptions) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        subscriptions.delete(channel);
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error: ${error}`);
  });
});

// Handle invoke requests
async function handleInvoke(ws: WebSocket, message: any) {
  const { channel, reqId, args } = message;
  
  try {
    // Validate request payload using shared validation
    const validatedArgs = ipcShared.validateRequest(channel, args);
    
    // Handle each channel
    let result;
    
    switch (channel) {
      // App channels
      case 'app:getVersions':
        result = {
          chrome: '120.0.0.0',
          node: '20.0.0',
          electron: '39.0.0'
        };
        break;
        
      case 'analytics:bootstrap':
        result = {
          installationId: getInstallationId(),
          apiUrl: API_URL,
          appVersion: '0.1.0'
        };
        break;
        
      case 'app:consumePendingDeepLink':
        result = { url: consumePendingDeepLink() };
        break;
        
      // Workspace channels
      case 'workspace:getRoot':
        result = await workspace.getRoot();
        break;
        
      case 'workspace:exists':
        result = await workspace.exists(validatedArgs.path);
        break;
        
      case 'workspace:stat':
        result = await workspace.stat(validatedArgs.path);
        break;
        
      case 'workspace:readdir':
        result = await workspace.readdir(validatedArgs.path);
        break;
        
      case 'workspace:readFile':
        result = await workspace.readFile(validatedArgs.path, validatedArgs.encoding);
        break;
        
      case 'workspace:writeFile':
        result = await workspace.writeFile(validatedArgs.path, validatedArgs.content, validatedArgs.encoding);
        break;
        
      case 'workspace:mkdir':
        result = await workspace.mkdir(validatedArgs.path, validatedArgs.recursive);
        break;
        
      case 'workspace:rename':
        result = await workspace.rename(validatedArgs.from, validatedArgs.to);
        break;
        
      case 'workspace:copy':
        result = await workspace.copy(validatedArgs.from, validatedArgs.to);
        break;
        
      case 'workspace:remove':
        result = await workspace.remove(validatedArgs.path, validatedArgs.opts);
        break;
        
      // Sessions channels
      case 'sessions:create':
        const sessions = container.resolve<ISessions>('sessions');
        const sessionId = await sessions.createSession(validatedArgs);
        result = { sessionId };
        break;
        
      case 'sessions:list':
        const sessionsList = container.resolve<ISessions>('sessions').listSessions();
        result = { sessions: sessionsList };
        break;
        
      case 'sessions:get':
        result = container.resolve<ISessions>('sessions').getSession(validatedArgs.sessionId);
        break;
        
      case 'sessions:getTurn':
        result = container.resolve<ISessions>('sessions').getTurn(validatedArgs.turnId);
        break;
        
      case 'sessions:sendMessage':
        result = container.resolve<ISessions>('sessions').sendMessage(
          validatedArgs.sessionId, 
          validatedArgs.input, 
          validatedArgs.config
        );
        break;
        
      case 'sessions:respondToPermission':
        await container.resolve<ISessions>('sessions').respondToPermission(
          validatedArgs.turnId, 
          validatedArgs.toolCallId, 
          validatedArgs.decision, 
          validatedArgs.metadata
        );
        result = { success: true };
        break;
        
      case 'sessions:respondToAskHuman':
        await container.resolve<ISessions>('sessions').respondToAskHuman(
          validatedArgs.turnId, 
          validatedArgs.toolCallId, 
          validatedArgs.answer
        );
        result = { success: true };
        break;
        
      case 'sessions:stopTurn':
        await container.resolve<ISessions>('sessions').stopTurn(
          validatedArgs.turnId, 
          validatedArgs.reason
        );
        result = { success: true };
        break;
        
      case 'sessions:resumeTurn':
        await container.resolve<ISessions>('sessions').resumeTurn(validatedArgs.sessionId);
        result = { success: true };
        break;
        
      case 'sessions:setTitle':
        await container.resolve<ISessions>('sessions').setTitle(
          validatedArgs.sessionId, 
          validatedArgs.title
        );
        result = { success: true };
        break;
        
      case 'sessions:delete':
        await container.resolve<ISessions>('sessions').deleteSession(validatedArgs.sessionId);
        result = { success: true };
        break;
        
      // Runs channels
      case 'runs:create':

        result = await runsCore.createRun(validatedArgs);
        break;
        
      case 'runs:createMessage':

        const messageId = await runsCore.createMessage(
          validatedArgs.runId, 
          validatedArgs.message, 
          validatedArgs.voiceInput, 
          validatedArgs.voiceOutput, 
          validatedArgs.searchEnabled, 
          validatedArgs.middlePaneContext, 
          validatedArgs.codeMode, 
          validatedArgs.codeCwd, 
          validatedArgs.codePolicy
        );
        result = { messageId };
        break;
        
      case 'runs:authorizePermission':

        await runsCore.authorizePermission(validatedArgs.runId, validatedArgs.authorization);
        result = { success: true };
        break;
        
      case 'runs:provideHumanInput':

        await runsCore.replyToHumanInputRequest(validatedArgs.runId, validatedArgs.reply);
        result = { success: true };
        break;
        
      case 'runs:stop':

        await runsCore.stop(validatedArgs.runId, validatedArgs.force);
        result = { success: true };
        break;
        
      case 'runs:fetch':

        result = await runsCore.fetchRun(validatedArgs.runId);
        break;
        
      case 'runs:list':

        result = await runsCore.listRuns(validatedArgs.cursor);
        break;
        
      case 'runs:listByWorkDir':

        result = await runsCore.listRunsByWorkDir(validatedArgs.dir);
        break;
        
      case 'runs:delete':

        await runsCore.deleteRun(validatedArgs.runId);
        result = { success: true };
        break;
        
      // Models channels
      case 'models:list':
        if (await isSignedIn()) {
          result = await listGatewayModels();
        } else {
          result = await listOnboardingModels();
        }
        break;
        
      case 'models:test':
        result = await testModelConnection(validatedArgs.provider, validatedArgs.model);
        break;
        
      case 'models:listForProvider':
        try {
          const models = await listModelsForProvider(validatedArgs.provider);
          result = { success: true, models };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to list models';
          result = { success: false, error: message };
        }
        break;
        
      case 'llm:getDefaultModel':
        result = await getDefaultModelAndProvider();
        break;
        
      case 'llm:generate':
        result = await generateOneShot(validatedArgs);
        break;
        
      // Search channel
      case 'search:query': {
        const sessions = container.resolve<ISessions>('sessions').listSessions()
          .map((s) => ({ sessionId: s.sessionId, title: s.title }));
        result = await search(validatedArgs.query, validatedArgs.limit, validatedArgs.types, sessions);
        break;
      }
        
      // Gmail channels
      case 'gmail:getImportant':
        result = await listImportantThreads({ cursor: validatedArgs.cursor, limit: validatedArgs.limit });
        break;
        
      case 'gmail:getEverythingElse':
        result = await listEverythingElseThreads({ cursor: validatedArgs.cursor, limit: validatedArgs.limit });
        break;
        
      case 'gmail:triggerSync':
        triggerGmailSync();
        result = {};
        break;
        
      case 'gmail:sendReply':
        result = await sendThreadReply(validatedArgs);
        break;
        
      case 'gmail:saveDraft':
        result = await saveThreadDraft(validatedArgs);
        break;
        
      case 'gmail:deleteDraft':
        result = await deleteThreadDraft(validatedArgs.draftId);
        break;
        
      case 'gmail:getDrafts':
        result = await listDraftThreads();
        break;
        
      case 'gmail:search':
        result = await searchThreads(validatedArgs.query, { limit: validatedArgs.limit });
        break;
        
      case 'gmail:getConnectionStatus':
        result = await getGmailConnectionStatus();
        break;
        
      case 'gmail:getAccountEmail':
        result = { email: await getAccountEmail() };
        break;
        
      case 'gmail:getAccountName':
        result = { name: await getAccountName() };
        break;
        
      case 'gmail:setImportance':
        const setImportanceResult = setThreadImportance(validatedArgs.threadId, validatedArgs.importance);
        result = { ok: setImportanceResult.success, previous: setImportanceResult.previous, error: setImportanceResult.error };
        break;
        
      case 'gmail:archiveThread':
        result = await archiveThread(validatedArgs.threadId);
        break;
        
      case 'gmail:trashThread':
        result = await trashThread(validatedArgs.threadId);
        break;
        
      case 'gmail:markThreadRead':
        result = await markThreadRead(validatedArgs.threadId, validatedArgs.read);
        break;
        
      case 'gmail:downloadAttachment':
        result = await downloadAttachment(validatedArgs);
        break;
        
      case 'gmail:saveMessageHeight':
        saveMessageBodyHeight(validatedArgs.threadId, validatedArgs.messageId, validatedArgs.height);
        result = {};
        break;
        
      case 'gmail:searchContacts':
        const query = validatedArgs?.query ?? '';
        const limit = validatedArgs?.limit;
        const excludeEmails = validatedArgs?.excludeEmails;
        
        const sent = await searchSentContacts(query, { limit, excludeEmails }).catch(() => []);
        if (sent.length > 0) {
          result = { contacts: sent };
        } else {
          const fallback = await searchGmailContacts(query, { limit, excludeEmails });
          result = { contacts: fallback };
        }
        break;
        
      // Knowledge channels
      case 'knowledge:history':
        result = { commits: await versionHistory.getFileHistory(validatedArgs.path) };
        break;
        
      case 'knowledge:fileAtCommit':
        result = { content: await versionHistory.getFileAtCommit(validatedArgs.path, validatedArgs.oid) };
        break;
        
      case 'knowledge:restore':
        await versionHistory.restoreFile(validatedArgs.path, validatedArgs.oid);
        result = { ok: true };
        break;
        
      // Live note channels
      case 'live-note:run':
        const liveNoteResult = await runLiveNoteAgent(validatedArgs.filePath, 'manual', validatedArgs.context);
        result = {
          success: !liveNoteResult.error,
          runId: liveNoteResult.runId,
          action: liveNoteResult.action,
          summary: liveNoteResult.summary,
          contentAfter: liveNoteResult.contentAfter,
          error: liveNoteResult.error,
        };
        break;
        
      case 'live-note:get':
        try {
          const live = await fetchLiveNote(validatedArgs.filePath);
          result = { success: true, live };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'live-note:set':
        try {
          await setLiveNote(validatedArgs.filePath, validatedArgs.live);
          const live = await fetchLiveNote(validatedArgs.filePath);
          result = { success: true, live };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'live-note:setActive':
        try {
          await setLiveNoteActive(validatedArgs.filePath, validatedArgs.active);
          const live = await fetchLiveNote(validatedArgs.filePath);
          result = { success: true, live };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'live-note:delete':
        try {
          await deleteLiveNote(validatedArgs.filePath);
          result = { success: true };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'live-note:stop':
        try {
          const live = await fetchLiveNote(validatedArgs.filePath);
          if (!live?.lastRunId) {
            result = { success: false, error: 'No active run for this note' };
          } else {
            await runsCore.stop(live.lastRunId, false);
            result = { success: true };
          }
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'live-note:listNotes':
        result = { notes: await listLiveNotes() };
        break;
        
      // Background task channels
      case 'bg-task:run':
        const bgTaskResult = await runBackgroundTask(validatedArgs.slug, 'manual', validatedArgs.context);
        result = {
          success: !bgTaskResult.error,
          runId: bgTaskResult.runId,
          summary: bgTaskResult.summary,
          error: bgTaskResult.error,
        };
        break;
        
      case 'bg-task:get':
        try {
          const task = await fetchTask(validatedArgs.slug);
          result = { success: true, task };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'bg-task:patch':
        try {
          const task = await patchTask(validatedArgs.slug, validatedArgs.partial);
          result = { success: true, task };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'bg-task:create':
        try {
          const { slug } = await createTask({
            name: validatedArgs.name,
            instructions: validatedArgs.instructions,
            ...(validatedArgs.triggers ? { triggers: validatedArgs.triggers } : {}),
            ...(validatedArgs.projectId ? { projectId: validatedArgs.projectId } : {}),
            ...(validatedArgs.model ? { model: validatedArgs.model } : {}),
            ...(validatedArgs.provider ? { provider: validatedArgs.provider } : {}),
          });
          result = { success: true, slug };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'bg-task:delete':
        try {
          await deleteTask(validatedArgs.slug);
          result = { success: true };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'bg-task:stop':
        try {
          const task = await fetchTask(validatedArgs.slug);
          if (!task?.lastRunId) {
            result = { success: false, error: 'No active run for this task' };
          } else {
            await runsCore.stop(task.lastRunId, false);
            result = { success: true };
          }
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
        
      case 'bg-task:list':
        result = await listTasks(validatedArgs);
        break;
        
      case 'bg-task:listRunIds':
        const runIds = await readTaskRunIds(validatedArgs.slug, validatedArgs.limit);
        result = { runIds };
        break;
        
      // Billing channel
      case 'billing:getInfo':
        result = await getBillingInfo();
        break;
        
      // Notifications channels
      case 'notifications:getSettings':
        result = loadNotificationSettings();
        break;
        
      case 'notifications:setSettings':
        saveNotificationSettings(validatedArgs);
        result = { success: true };
        break;
        
      // Voice channels
      case 'voice:getConfig':
        result = voice.getVoiceConfig();
        break;
        
      case 'voice:synthesize':
        result = voice.synthesizeSpeech(validatedArgs.text);
        break;
        
      // Meeting channels
      case 'meeting:summarize':
        const notes = await summarizeMeeting(validatedArgs.transcript, validatedArgs.meetingStartTime, validatedArgs.calendarEventJson);
        result = { notes };
        break;
        
      case 'meeting-prep:resolve':
        const prepResult = await resolveMeetingPrep(validatedArgs.attendees);
        const prepNote = validatedArgs.eventId ? await readPrepNoteForEvent(validatedArgs.eventId) : null;
        result = { ...prepResult, prepNote };
        break;
        
      case 'inline-task:classifySchedule':
        const schedule = await classifySchedule(validatedArgs.instruction);
        result = { schedule };
        break;
        
      case 'inline-task:process':
        result = await processRowboatInstruction(validatedArgs.instruction, validatedArgs.noteContent, validatedArgs.notePath);
        break;
        
      // Google Docs channels
      case 'google-docs:getStatus':
        result = getGoogleDocsConnectionStatus();
        break;
        
      case 'google-docs:import':
        try {
          const importResult = await importGoogleDoc(validatedArgs.fileId, validatedArgs.targetFolder);
          result = importResult;
        } catch (err) {
          throw err;
        }
        break;
        
      case 'google-docs:pickViaManaged':
        const pickResult = await startManagedGooglePick(validatedArgs.targetFolder);
        result = pickResult;
        break;
        
      case 'google-docs:refreshSnapshot':
        result = await syncGoogleDocDown(validatedArgs.path);
        break;
        
      case 'google-docs:sync':
        result = await syncGoogleDocUp(validatedArgs.path, { force: validatedArgs.force });
        break;
        
      case 'google-docs:getLink':
        result = { link: await getGoogleDocLink(validatedArgs.path) };
        break;
        
      // OAuth channels
      case 'oauth:connect': {
        // In web mode, the user is already authenticated via the SaaS JWT.
        // If they have a WebSocket token, they're already "connected" —
        // return success and emit the connected event so the renderer
        // updates its state.
        const workerToken = clientAuthTokens.get(ws) || '';
        if (validatedArgs.provider === 'rowboat') {
          if (workerToken) {
            // Already connected via JWT — fire the event so UI updates
            ws.send(JSON.stringify({
              type: 'event',
              channel: 'oauth:didConnect',
              event: { provider: 'rowboat', success: true },
            }));
            result = { success: true };
            break;
          }
          // No JWT at all — redirect to dashboard sign-in
          result = { redirect: 'https://dash.divinityworks.space/signin' };
          break;
        }
        const credentials = validatedArgs.clientId && validatedArgs.clientSecret
          ? { clientId: validatedArgs.clientId.trim(), clientSecret: validatedArgs.clientSecret.trim() }
          : undefined;
        result = await connectProvider(validatedArgs.provider, credentials);
        break;
      }

      case 'oauth:disconnect': {
        // In web mode, "disconnect" = sign out from the SaaS dashboard.
        // We can't revoke the JWT from here (the dashboard owns it), so
        // we redirect the user to the dashboard logout page.
        if (validatedArgs.provider === 'rowboat') {
          result = { redirect: 'https://dash.divinityworks.space/auth/logout' };
          break;
        }
        result = await disconnectProvider(validatedArgs.provider);
        break;
      }
        
      case 'oauth:list-providers':
        result = listProviders();
        break;
        
      case 'oauth:getState': {
        const oauthRepo = container.resolve('oauthRepo');
        const config = await oauthRepo.getClientFacingConfig();
        result = { config };
        break;
      }
        
      // Account channels
      case 'account:getRowboat': {
        // WEB-ONLY: Authentication is via Worker JWT only.
        // No token in WebSocket subprotocol = not signed in = show SignInGate.
        // The Electron local-account fallback is removed for the web app.
        const workerToken = clientAuthTokens.get(ws) || '';
        if (workerToken) {
          const config = await getRowboatConfig();
          result = { signedIn: true, accessToken: workerToken, config };
        } else {
          result = { signedIn: false, accessToken: null, config: null };
        }
        break;
      }
        
      // Granola channels
      case 'granola:getConfig':
        const granolaConfigRepo = container.resolve('granolaConfigRepo');
        const granolaConfig = await granolaConfigRepo.getConfig();
        result = { enabled: granolaConfig.enabled };
        break;
        
      case 'granola:setConfig':
        const granolaRepo = container.resolve('granolaConfigRepo');
        await granolaRepo.setConfig({ enabled: validatedArgs.enabled });
        if (validatedArgs.enabled) {
          triggerGranolaSync();
        }
        result = { success: true };
        break;
        
      // Code mode channels
      case 'codeMode:getConfig':
        const codeModeConfigRepo = container.resolve('codeModeConfigRepo');
        const codeModeConfig = await codeModeConfigRepo.getConfig();
        result = { enabled: codeModeConfig.enabled, approvalPolicy: codeModeConfig.approvalPolicy };
        break;
        
      case 'codeMode:setConfig':
        const codeModeRepo = container.resolve('codeModeConfigRepo');
        await codeModeRepo.setConfig({ enabled: validatedArgs.enabled, approvalPolicy: validatedArgs.approvalPolicy });
        invalidateCopilotInstructionsCache();
        result = { success: true };
        break;
        
      case 'codeMode:checkAgentStatus':
        result = await checkCodeModeAgentStatus();
        break;
        
      case 'codeMode:provisionEngine':
        try {
          await ensureEngine(validatedArgs.agent, {
            onProgress: () => {},
          });
          result = { success: true };
        } catch (e) {
          result = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
        break;
        
      // Channels channels
      case 'channels:getConfig':
        result = container.resolve('channelsConfigRepo').getConfig();
        break;
        
      case 'channels:setConfig':
        await container.resolve('channelsConfigRepo').setConfig(validatedArgs);
        await applyChannelsConfig(validatedArgs);
        result = { success: true };
        break;
        
      case 'channels:getStatus':
        result = getChannelsStatus();
        break;
        
      case 'channels:whatsappLogout':
        await logoutWhatsApp();
        result = { success: true };
        break;
        
      // Slack channels
      case 'slack:getConfig':
        const slackConfigRepo = container.resolve('slackConfigRepo');
        const slackConfig = await slackConfigRepo.getConfig();
        result = { enabled: slackConfig.enabled, workspaces: slackConfig.workspaces };
        break;
        
      case 'slack:setConfig':
        const slackRepo = container.resolve('slackConfigRepo');
        await slackRepo.setConfig({ enabled: validatedArgs.enabled, workspaces: validatedArgs.workspaces });
        invalidateCopilotInstructionsCache();
        result = { success: true };
        break;
        
      case 'slack:cliStatus':
        result = await getAgentSlackCliStatus();
        break;
        
      case 'slack:knowledgeStatus':
        result = {
          cli: await getAgentSlackCliStatus(),
          sources: getSlackKnowledgeSyncStatus(),
        };
        break;
        
      case 'slack:listWorkspaces':
        const whoamiResult = await runAgentSlack(['auth', 'whoami'], { timeoutMs: 10000 });
        if (!whoamiResult.ok) {
          result = { workspaces: [], error: whoamiResult.message, errorKind: whoamiResult.kind };
        } else {
          const workspaces = parseWhoamiWorkspaces(whoamiResult.data);
          result = { workspaces };
        }
        break;
        
      case 'slack:importDesktopAuth':
        // Pull xoxc token(s) + cookie from the running/installed Slack desktop
        // app into agent-slack's credential store, then read back the workspaces.
        const imported = await runAgentSlack(['auth', 'import-desktop'], { timeoutMs: 20000, parseJson: false });
        if (!imported.ok) {
          result = { ok: false, workspaces: [], error: imported.message, errorKind: imported.kind };
        } else {
          const whoami = await runAgentSlack(['auth', 'whoami'], { timeoutMs: 10000 });
          if (!whoami.ok) {
            result = { ok: false, workspaces: [], error: whoami.message, errorKind: whoami.kind };
          } else {
            const workspaces = parseWhoamiWorkspaces(whoami.data);
            if (workspaces.length === 0) {
              result = { ok: false, workspaces: [], error: 'No signed-in Slack workspaces found in the desktop app.', errorKind: 'not_authed' };
            } else {
              result = { ok: true, workspaces };
            }
          }
        }
        break;
        
      case 'slack:quitAndImportDesktop':
        // Windows-only convenience: kill Slack (which locks its Cookies DB) then
        // run the normal desktop import in one click.
        result = { ok: false, workspaces: [], error: 'Not implemented for non-Windows platforms', errorKind: 'not_supported' };
        break;
        
      case 'slack:parseCurlAuth':
        // Cross-OS fallback to desktop import: the user pastes a "Copy as cURL"
        // request from a signed-in Slack web tab; parse-curl reads it from stdin
        // and extracts the xoxc token + xoxd cookie. No leveldb, no OS keychain.
        const curl = (validatedArgs.curl ?? '').trim();
        if (!curl) {
          result = { ok: false, workspaces: [], error: 'Paste the copied cURL command first.', errorKind: 'unknown' };
        } else {
          const imported = await runAgentSlack(['auth', 'parse-curl'], { timeoutMs: 15000, parseJson: false, input: curl });
          if (!imported.ok) {
            result = { ok: false, workspaces: [], error: imported.message, errorKind: imported.kind };
          } else {
            const whoami = await runAgentSlack(['auth', 'whoami'], { timeoutMs: 10000 });
            if (!whoami.ok) {
              result = { ok: false, workspaces: [], error: whoami.message, errorKind: whoami.kind };
            } else {
              const workspaces = parseWhoamiWorkspaces(whoami.data);
              if (workspaces.length === 0) {
                result = { ok: false, workspaces: [], error: 'Tokens were saved but no workspace was found. Double-check the copied request.', errorKind: 'not_authed' };
              } else {
                result = { ok: true, workspaces };
              }
            }
          }
        }
        break;
        
      case 'slack:listChannels':
        const channelResult = await runAgentSlack(['channel', 'list', '--all', '--workspace', validatedArgs.workspaceUrl, '--limit', '200'], { timeoutMs: 15000 });
        if (!channelResult.ok) {
          result = { channels: [], error: channelResult.message };
        } else {
          const rawChannels = extractArrayPayload(channelResult.data) as Array<{
            id?: string;
            name?: string;
            is_private?: boolean;
            isPrivate?: boolean;
            is_member?: boolean;
            isMember?: boolean;
          }>;
          const channels = rawChannels.map((ch) => ({
            id: ch.id || ch.name || '',
            name: ch.name || ch.id || '',
            isPrivate: ch.is_private ?? ch.isPrivate,
            isMember: ch.is_member ?? ch.isMember,
          })).filter((ch) => ch.id && ch.name);
          result = { channels };
        }
        break;
        
      case 'slack:getRecentMessages':
        const slackConfig2 = await container.resolve('slackConfigRepo').getConfig();
        if (!slackConfig2.enabled || slackConfig2.workspaces.length === 0) {
          result = { enabled: false, messages: [] };
        } else {
          const limit = Math.min(Math.max(validatedArgs.limit ?? 5, 1), 20);
          const messages: any[] = [];
          const userNameCache = new Map<string, string>();
          
          try {
            const knowledgeConfig = knowledgeSourcesRepo.getConfig();
            const slackSource = knowledgeConfig.sources.find(source => source.id === 'slack' && source.provider === 'slack' && source.enabled);
            let channels: any[] = (slackSource?.scopes ?? [])
              .filter(scope => scope.type === 'channel')
              .map(scope => ({
                id: scope.id,
                name: scope.name ?? scope.id,
                workspaceUrl: scope.workspaceUrl,
                workspaceName: slackConfig2.workspaces.find(workspace => workspace.url === scope.workspaceUrl)?.name,
              }));
            
            if (channels.length === 0) {
              for (const workspace of slackConfig2.workspaces) {
                const channelList = await runAgentSlack(['channel', 'list', '--workspace', workspace.url, '--limit', '12'], { timeoutMs: 15000 });
                if (!channelList.ok) {
                  throw new AgentSlackRunError(channelList.kind, channelList.message);
                }
                const rawChannels = extractArrayPayload(channelList.data);
                for (const raw of rawChannels) {
                  if (!raw || typeof raw !== 'object') continue;
                  const channel = raw as Record<string, unknown>;
                  const id = typeof channel.id === 'string' ? channel.id : undefined;
                  const name = typeof channel.name === 'string' ? channel.name : id;
                  const isMember = channel.is_member ?? channel.isMember;
                  if (!id || !name || isMember === false) continue;
                  channels.push({ id, name, workspaceUrl: workspace.url, workspaceName: workspace.name });
                }
              }
            }
            
            channels = channels.slice(0, 8);
            
            for (const channel of channels) {
              const commandArgs = ['message', 'list', channel.id, '--limit', '5', '--max-body-chars', '500'];
              if (channel.workspaceUrl) {
                commandArgs.push('--workspace', channel.workspaceUrl);
              }
              const messageList = await runAgentSlack(commandArgs, { timeoutMs: 15000, maxBuffer: 1024 * 1024 });
              if (!messageList.ok) {
                console.warn(`[Slack] Failed to load messages for ${channel.name}: ${messageList.message}`);
                continue;
              }
              const rawMessages = extractArrayPayload(messageList.data);
              for (const raw of rawMessages) {
                if (!raw || typeof raw !== 'object') continue;
                const message = raw as Record<string, unknown>;
                const ts = typeof message.ts === 'string' ? message.ts : undefined;
                const text = slackMessageText(message);
                if (!ts || !text) continue;
                const channelId = typeof message.channel_id === 'string'
                  ? message.channel_id
                  : typeof message.channel === 'string'
                    ? message.channel
                    : channel.id;
                const resolvedAuthor = await resolveSlackAuthor(slackMessageAuthor(message), channel.workspaceUrl, userNameCache);
                const resolvedText = await resolveSlackMessageText(text, channel.workspaceUrl, userNameCache);
                messages.push({
                  id: `${channel.workspaceUrl ?? 'workspace'}:${channelId}:${ts}`,
                  workspaceName: channel.workspaceName,
                  workspaceUrl: channel.workspaceUrl,
                  channelId,
                  channelName: channel.name,
                  author: resolvedAuthor,
                  text: resolvedText,
                  ts,
                  url: slackMessageUrl(message, channel.workspaceUrl, channelId, ts),
                });
              }
            }
            
            const rankedIds = await rankSlackHomeMessages(messages, limit);
            const byId = new Map(messages.map(message => [message.id, message]));
            const rankedMessages = rankedIds
              .map(id => byId.get(id))
              .filter((message): message is any => Boolean(message));
            result = { enabled: true, messages: rankedMessages };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load Slack messages';
            const errorKind = err instanceof AgentSlackRunError ? err.kind : undefined;
            result = { enabled: true, messages: [], error: message, errorKind };
          }
        }
        break;
        
      // Knowledge sources channels
      case 'knowledgeSources:getConfig':
        result = knowledgeSourcesRepo.getConfig();
        break;
        
      case 'knowledgeSources:upsert': {
        const config = knowledgeSourcesRepo.upsertSource(validatedArgs);
        if (validatedArgs.provider === 'slack') {
          invalidateCopilotInstructionsCache();
          triggerSlackKnowledgeSync();
          void syncSlackKnowledgeSources().catch(error => {
            console.error('[SlackKnowledge] Immediate sync after settings update failed:', error);
          });
        }
        result = config;
        break;
      }

      // Onboarding channels
      case 'onboarding:getStatus':
        const complete = isOnboardingComplete();
        result = { showOnboarding: !complete };
        break;
        
      case 'onboarding:markComplete':
        markOnboardingComplete();
        result = { success: true };
        break;
        
      // Composio channels
      case 'composio:is-configured':
        result = { configured: false }; // stub
        break;
        
      case 'composio:set-api-key':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'composio:initiate-connection':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'composio:get-connection-status':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'composio:sync-connection':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'composio:disconnect':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'composio:list-connected':
        result = { connected: [] };
        break;
        
      case 'composio:list-toolkits':
        result = { toolkits: [] };
        break;
        
      case 'composio:execute-tool':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'composio:search-tools':
        result = { tools: [] };
        break;
        
      // Migration channels
      case 'migration:check-composio-google':
        result = { needsMigration: false };
        break;
        
      // Apps channels
      case 'apps:serverStatus':
        result = appsServer.getServerStatus();
        break;
        
      case 'apps:list':
        const status = appsServer.getServerStatus();
        const apps = await appsIndexer.listApps();
        for (const app of apps) {
          if (app.agentSlugs.length) await appsAgents.syncAppAgents(app);
        }
        const fingerprint = JSON.stringify(apps.map((a) => [a.folder, a.manifest?.name, a.manifest?.description, a.hasDist]));
        result = {
          serverRunning: status.running,
          ...(status.error ? { serverError: status.error } : {}),
          apps,
        };
        break;
        
      case 'apps:get':
        const app = await appsIndexer.getApp(validatedArgs.folder);
        if (!app) throw new Error(`no such app: ${validatedArgs.folder}`);
        const readme = await appsIndexer.readAppReadme(validatedArgs.folder);
        result = {
          app,
          ...(readme ? { readme } : {}),
          rollbackAvailable: await appsIndexer.rollbackAvailable(validatedArgs.folder),
        };
        break;
        
      case 'apps:create':
        const createdApp = await appsIndexer.createApp(validatedArgs);
        result = { app: createdApp };
        break;
        
      case 'apps:delete':
        await appsIndexer.deleteApp(validatedArgs.folder);
        result = { ok: true };
        break;
        
      case 'apps:setTheme':
        appsServer.setAppsTheme(validatedArgs.theme);
        result = { ok: true };
        break;
        
      case 'apps:catalogIndex':
        result = registryClient.refreshIndex(validatedArgs.force);
        break;
        
      case 'apps:catalogSearch':
        result = { records: await registryClient.search(validatedArgs.query) };
        break;
        
      case 'apps:catalogStars':
        const [stars, starred] = await Promise.all([
          appsStars.repoStars(validatedArgs.repos),
          appsStars.starredStatus(validatedArgs.repos),
        ]);
        result = { stars, starred };
        break;
        
      case 'apps:star':
        const starResult = await appsStars.setStar(validatedArgs.repo, validatedArgs.star);
        result = starResult;
        break;
        
      case 'apps:catalogDetail': {
        const record = await registryClient.resolve(validatedArgs.name);
        if (!record) throw new Error(`no such app in the catalog: ${validatedArgs.name}`);
        let manifest;
        try { manifest = await registryClient.latestManifest(record); } catch { /* best effort */ }
        let catReadme: string | undefined;
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${record.repo}/HEAD/README.md`);
          if (res.ok) catReadme = await res.text();
        } catch { /* best effort */ }
        const installed = (await appsIndexer.listApps()).find((a) => a.install?.name === validatedArgs.name);
        result = {
          record,
          ...(manifest ? { manifest } : {}),
          ...(catReadme ? { readme: catReadme } : {}),
          ...(installed ? { installedFolder: installed.folder } : {}),
        };
        break;
      }
        
      case 'apps:install':
        const installRecord = await registryClient.resolve(validatedArgs.name);
        if (!installRecord) throw new Error(`no such app in the catalog: ${validatedArgs.name}`);
        if (!validatedArgs.confirmed) {
          result = await appsInstaller.previewInstall(installRecord);
        } else {
          const preview = await appsInstaller.previewInstall(installRecord);
          const installResult = await appsInstaller.installFromRegistry(installRecord, preview);
          result = installResult;
        }
        break;
        
      case 'apps:installFromUrl':
        if (!validatedArgs.confirmed) {
          result = appsInstaller.previewUrlInstall(validatedArgs.url);
        } else {
          const installResult = await appsInstaller.confirmUrlInstall(validatedArgs.url);
          result = installResult;
        }
        break;
        
      case 'apps:uninstall':
        await appsInstaller.uninstallApp(validatedArgs.folder);
        result = { ok: true };
        break;
        
      case 'apps:checkUpdate':
        result = appsInstaller.checkUpdate(validatedArgs.folder);
        break;
        
      case 'apps:update':
        const before = (await appsIndexer.getApp(validatedArgs.folder))?.manifest?.version;
        const updatedApp = await appsInstaller.updateApp(validatedArgs.folder, {
          confirmOverwriteModified: validatedArgs.confirmOverwriteModified,
          confirmNewCapabilities: validatedArgs.confirmNewCapabilities,
        });
        result = { app: updatedApp };
        break;
        
      case 'apps:rollback':
        result = { app: await appsInstaller.rollbackApp(validatedArgs.folder) };
        break;
        
      case 'apps:publish':
        result = appsPublisher.publishApp(validatedArgs.folder, () => {});
        break;
        
      case 'apps:publishUpdate':
        result = appsPublisher.publishUpdate(validatedArgs.folder, validatedArgs.increment);
        break;
        
      case 'apps:registerExisting':
        result = appsPublisher.registerExisting(validatedArgs.name, validatedArgs.repo);
        break;
        
      // GitHub auth channels
      case 'githubAuth:start':
        result = { device_code: 'stub', user_code: 'stub', verification_uri: 'https://example.com', expires_in: 600 };
        break;
        
      case 'githubAuth:poll':
        result = { status: 'pending', device_code: 'stub' };
        break;
        
      case 'githubAuth:status':
        result = { authenticated: false };
        break;
        
      case 'githubAuth:signOut':
        result = { ok: true };
        break;
        
      // Agent schedule channels
      case 'agent-schedule:getConfig':
        const agentScheduleRepo = container.resolve('agentScheduleRepo');
        try {
          result = await agentScheduleRepo.getConfig();
        } catch {
          result = { agents: {} };
        }
        break;
        
      case 'agent-schedule:getState':
        const agentScheduleStateRepo = container.resolve('agentScheduleStateRepo');
        try {
          result = await agentScheduleStateRepo.getState();
        } catch {
          result = { agents: {} };
        }
        break;
        
      case 'agent-schedule:updateAgent':
        const repo = container.resolve('agentScheduleRepo');
        await repo.upsert(validatedArgs.agentName, validatedArgs.entry);
        triggerAgentScheduleRun();
        result = { success: true };
        break;
        
      case 'agent-schedule:deleteAgent':
        const stateRepo = container.resolve('agentScheduleStateRepo');
        await repo.delete(validatedArgs.agentName);
        await stateRepo.deleteAgentState(validatedArgs.agentName);
        result = { success: true };
        break;
        
      // Shell channels
      case 'shell:openPath':
        result = { error: 'Not implemented' };
        break;
        
      case 'shell:showItemInFolder':
        result = { success: true };
        break;
        
      case 'shell:readFileBase64':
        result = { error: 'Not implemented' };
        break;
        
      // Terminal channels
      case 'terminal:ensure':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'terminal:input':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'terminal:resize':
        result = { success: false, error: 'Not implemented' };
        break;
        
      case 'terminal:dispose':
        result = { success: false, error: 'Not implemented' };
        break;
        
      // Dialog channels
      case 'dialog:openDirectory':
        result = { path: null };
        break;
        
      case 'dialog:openFiles':
        result = { paths: [] };
        break;
        
      // Video channels
      case 'video:setPopout':
        result = {};
        break;
        
      case 'video:popoutState':
        result = {};
        break;
        
      case 'video:getPopoutState':
        result = { state: null };
        break;
        
      case 'video:popoutAction':
        result = {};
        break;
        
      // Auto-update channels
      case 'update:check':
        result = { ok: false, error: 'Not implemented' };
        break;
        
      case 'update:install':
        result = { ok: false, error: 'Not implemented' };
        break;
        
      case 'update:dismiss':
        result = { ok: true };
        break;
        
      // Default case for unimplemented channels
      default:
        console.warn(`Unhandled IPC channel: ${channel}`);
        result = { error: `Channel not implemented: ${channel}` };
        break;
    }
    
    // Send response
    ws.send(JSON.stringify({
      type: 'response',
      reqId,
      result
    }));
    
  } catch (error) {
    console.error(`Error handling invoke for ${channel}:`, error);
    ws.send(JSON.stringify({
      type: 'error',
      reqId,
      error: error instanceof Error ? error.message : String(error)
    }));
  }
}

// Setup event broadcasting
function setupEventBroadcasting() {
  // Broadcast runs events
  bus.subscribe('*', async (event) => {
    broadcastToSubscribers('runs:events', event);
  });
  
  // Broadcast services events
  serviceBus.subscribe(async (event) => {
    broadcastToSubscribers('services:events', event);
  });
  
  // Broadcast sessions events
  const sessionBus = container.resolve<SessionBusType>('sessionBus');
  sessionBus.subscribe((event) => {
    broadcastToSubscribers('sessions:events', event);
  });
  
  // Broadcast turns events
  const turnEventBus = container.resolve<TurnEventBusType>('turnEventBus');
  turnEventBus.subscribeAll((event) => {
    if (isDurableTurnEvent(event.event)) {
      broadcastToSubscribers('turns:events', event);
      return;
    }
  });
  
  // Broadcast code run events
  const codeRunFeed = container.resolve<CodeRunFeed>('codeRunFeed');
  codeRunFeed.subscribe((event) => {
    broadcastToSubscribers('codeRun:events', event);
  });
  
  // Broadcast live note agent events
  liveNoteBus.subscribe((event) => {
    broadcastToSubscribers('live-note-agent:events', event);
  });
  
  // Broadcast background task agent events
  backgroundTaskBus.subscribe((event) => {
    broadcastToSubscribers('bg-task-agent:events', event);
  });
}

// Start event broadcasting
setupEventBroadcasting();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing WebSocket server');
  wss.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing WebSocket server');
  wss.close();
  process.exit(0);
});
