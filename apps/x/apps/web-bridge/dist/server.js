import { WebSocketServer, WebSocket } from "ws";
import { resolve } from "path";
import { homedir } from "os";
import { createHmac, timingSafeEqual } from "crypto";
import { initConfigs } from "@x/core/dist/config/initConfigs.js";
import container from "@x/core/dist/di/container.js";
import { asClass } from "awilix";
import { ipc as ipcShared } from "@x/shared";
process.env.ROWBOAT_WORKDIR = resolve(homedir(), ".divinity");
initConfigs();
import { workspace, versionHistory, voice } from "@x/core";
import * as runsCore from "@x/core/dist/runtime/legacy/runs.js";
import { bus } from "@x/core/dist/runtime/legacy/bus.js";
import { serviceBus } from "@x/core/dist/services/service_bus.js";
import { listOnboardingModels } from "@x/core/dist/models/models-dev.js";
import { testModelConnection, listModelsForProvider, generateOneShot } from "@x/core/dist/models/models.js";
import { getDefaultModelAndProvider } from "@x/core/dist/models/defaults.js";
import { isSignedIn } from "@x/core/dist/account/account.js";
import { listGatewayModels } from "@x/core/dist/models/gateway.js";
import { invalidateCopilotInstructionsCache } from "@x/core/dist/runtime/assembly/copilot/instructions.js";
import { triggerSync as triggerGranolaSync } from "@x/core/dist/knowledge/granola/sync.js";
import { syncSlackKnowledgeSources, triggerSync as triggerSlackKnowledgeSync, getSlackKnowledgeSyncStatus } from "@x/core/dist/knowledge/sources/sync_slack.js";
import { isOnboardingComplete, markOnboardingComplete } from "@x/core/dist/config/note_creation_config.js";
import { loadNotificationSettings, saveNotificationSettings } from "@x/core/dist/config/notification_config.js";
import * as appsIndexer from "@x/core/dist/apps/indexer.js";
import * as appsServer from "@x/core/dist/apps/server.js";
import * as appsAgents from "@x/core/dist/apps/agents.js";
import * as appsStars from "@x/core/dist/apps/stars.js";
import * as appsInstaller from "@x/core/dist/apps/installer.js";
import { registryClient } from "@x/core/dist/apps/registry.js";
import * as appsPublisher from "@x/core/dist/apps/publisher.js";
import { runAgentSlack, getAgentSlackCliStatus, AgentSlackRunError } from "@x/core/dist/slack/agent-slack-exec.js";
import { knowledgeSourcesRepo } from "@x/core/dist/knowledge/sources/repo.js";
import { rankSlackHomeMessages } from "@x/core/dist/knowledge/sources/rank_slack_home.js";
import { applyChannelsConfig, getChannelsStatus, logoutWhatsApp } from "@x/core/dist/channels/service.js";
import { ensureEngine } from "@x/core/dist/code-mode/acp/engine-provisioner.js";
import { checkCodeModeAgentStatus } from "@x/core/dist/code-mode/status.js";
import { search } from "@x/core/dist/search/search.js";
import { resolveMeetingPrep } from "@x/core/dist/knowledge/meeting_prep.js";
import { readPrepNoteForEvent } from "@x/core/dist/knowledge/meeting_prep_brief.js";
import { classifySchedule, processRowboatInstruction } from "@x/core/dist/knowledge/inline_tasks.js";
import { getBillingInfo } from "@x/core/dist/billing/billing.js";
import { summarizeMeeting } from "@x/core/dist/knowledge/summarize_meeting.js";
import { getRowboatConfig } from "@x/core/dist/config/rowboat.js";
import { runLiveNoteAgent } from "@x/core/dist/knowledge/live-note/runner.js";
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
  setThreadImportance
} from "@x/core/dist/knowledge/sync_gmail.js";
import { searchContacts as searchGmailContacts } from "@x/core/dist/knowledge/gmail_contacts.js";
import { searchSentContacts } from "@x/core/dist/knowledge/gmail_sent_contacts.js";
import {
  getGoogleDocsConnectionStatus,
  importGoogleDoc,
  syncGoogleDocDown,
  syncGoogleDocUp,
  getGoogleDocLink
} from "@x/core/dist/knowledge/google_docs.js";
import { liveNoteBus } from "@x/core/dist/knowledge/live-note/bus.js";
import { getInstallationId } from "@x/core/dist/analytics/installation.js";
import { API_URL } from "@x/core/dist/config/env.js";
import {
  fetchLiveNote,
  setLiveNote,
  setLiveNoteActive,
  deleteLiveNote,
  listLiveNotes
} from "@x/core/dist/knowledge/live-note/fileops.js";
import { runBackgroundTask } from "@x/core/dist/background-tasks/runner.js";
import { backgroundTaskBus } from "@x/core/dist/background-tasks/bus.js";
import {
  fetchTask,
  patchTask,
  createTask,
  deleteTask,
  listTasks,
  readRunIds as readTaskRunIds
} from "@x/core/dist/background-tasks/fileops.js";
import { triggerRun as triggerAgentScheduleRun } from "@x/core/dist/agent-schedule/runner.js";
import { isDurableTurnEvent } from "@x/shared/dist/turns.js";
const webTokens = /* @__PURE__ */ new Map();
let activeToken = null;
class WebOAuthRepo {
  async read(provider) {
    if (provider === "rowboat" && activeToken) {
      let expiresAt = Math.floor(Date.now() / 1e3) + 3600;
      try {
        const payload = JSON.parse(Buffer.from(activeToken.split(".")[1], "base64url").toString("utf8"));
        expiresAt = payload.exp ?? expiresAt;
      } catch {
      }
      return {
        tokens: {
          access_token: activeToken,
          refresh_token: null,
          expires_at: expiresAt,
          token_type: "Bearer",
          scopes: []
        },
        mode: "rowboat"
      };
    }
    return {};
  }
  async upsert() {
  }
  async delete() {
  }
  async getClientFacingConfig() {
    if (activeToken) {
      return {
        rowboat: { connected: true, error: null, clientId: null }
      };
    }
    return {};
  }
}
container.register({
  oauthRepo: asClass(WebOAuthRepo).singleton()
});
async function connectProvider(_provider, _credentials) {
  return { error: "not_implemented" };
}
async function disconnectProvider(_provider) {
  return { error: "not_implemented" };
}
function listProviders() {
  return [];
}
async function startManagedGooglePick(_targetFolder) {
  return { error: "not_implemented" };
}
function consumePendingDeepLink() {
  return null;
}
function parseWhoamiWorkspaces(data) {
  const parsed = data ?? {};
  return (parsed.workspaces || []).map((w) => ({
    url: w.workspace_url || "",
    name: w.workspace_name || ""
  }));
}
function extractArrayPayload(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed;
    for (const key of ["messages", "channels", "items", "results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return [];
}
function slackMessageText(message) {
  const value = message.text ?? message.body ?? message.content;
  return typeof value === "string" ? value.trim() : "";
}
function slackMessageAuthor(message) {
  const value = message.username ?? message.user ?? message.author;
  return typeof value === "string" ? value : void 0;
}
function extractSlackUserName(raw) {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw;
  const profile = obj.profile && typeof obj.profile === "object" ? obj.profile : void 0;
  const user = obj.user && typeof obj.user === "object" ? obj.user : void 0;
  const userProfile = user?.profile && typeof user.profile === "object" ? user.profile : void 0;
  const candidates = [
    profile?.display_name,
    profile?.real_name,
    userProfile?.display_name,
    userProfile?.real_name,
    obj.display_name,
    obj.displayName,
    obj.real_name,
    obj.realName,
    user?.display_name,
    user?.displayName,
    user?.real_name,
    user?.realName,
    obj.name,
    user?.name
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}
async function resolveSlackUserName(userId, workspaceUrl, cache) {
  const key = `${workspaceUrl ?? ""}:${userId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const args = ["user", "get", userId];
  if (workspaceUrl) args.push("--workspace", workspaceUrl);
  const result = await runAgentSlack(args, { timeoutMs: 1e4, maxBuffer: 512 * 1024 });
  if (result.ok) {
    const name = extractSlackUserName(result.data ?? {});
    if (name) {
      cache.set(key, name);
      return name;
    }
  } else {
    console.warn(`[Slack] Failed to resolve user ${userId}: ${result.message}`);
  }
  cache.set(key, userId);
  return null;
}
async function resolveSlackMessageText(text, workspaceUrl, cache) {
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
async function resolveSlackAuthor(author, workspaceUrl, cache) {
  if (!author) return void 0;
  if (!/^[UW][A-Z0-9]{6,}$/.test(author)) return author;
  return await resolveSlackUserName(author, workspaceUrl, cache) ?? author;
}
function slackMessageUrl(message, workspaceUrl, channelId, ts) {
  const direct = message.permalink ?? message.url;
  if (typeof direct === "string" && direct) return direct;
  if (!workspaceUrl || !channelId) return void 0;
  return `${workspaceUrl.replace(/\/$/, "")}/archives/${channelId}/p${ts.replace(".", "")}`;
}
const electronStubs = {
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: "" })
  },
  shell: {
    openPath: async () => "",
    openExternal: async () => {
    },
    showItemInFolder: async () => {
    }
  },
  systemPreferences: {
    getMediaAccessStatus: () => "granted",
    askForMediaAccess: async () => true
  },
  desktopCapturer: {
    getSources: async () => []
  },
  powerSaveBlocker: {
    start: () => 1,
    stop: () => {
    },
    isStarted: () => false
  },
  autoUpdater: {
    checkForUpdates: async () => {
    },
    quitAndInstall: () => {
    }
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  },
  app: {
    getVersion: () => "0.1.0",
    isPackaged: false,
    getApplicationName: () => "Divinity Works"
  }
};
import { createServer } from "http";
import { extname, join } from "path";
import { readFile, stat } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RENDERER_DIST = resolve(__dirname, "../renderer/dist-web");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8"
};
const JWT_SECRET = process.env.JWT_SECRET || "";
function isTokenValid(token) {
  if (!JWT_SECRET) {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return false;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      if (payload.exp && Date.now() >= payload.exp * 1e3) return false;
      return true;
    } catch {
      return false;
    }
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = Buffer.from(sigB64, "base64url");
    const expectedSig = createHmac("sha256", JWT_SECRET).update(signingInput).digest();
    if (sig.length !== expectedSig.length) return false;
    if (!timingSafeEqual(sig, expectedSig)) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp && Date.now() >= payload.exp * 1e3) return false;
    if (payload.type && payload.type !== "access") return false;
    return true;
  } catch {
    return false;
  }
}
function decodeJwtPayload(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString());
  } catch {
    return null;
  }
}
const SIGN_IN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#ffffff" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>Sign in \u2014 Divinity Works</title>
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
    @media (max-width: 768px) {
      .nav__inner { padding: 12px 16px; }
      .nav__links { display: none; }
      .main { padding: 32px 16px; padding-top: 20vh; }
      .logo { width: 56px; height: 56px; margin-bottom: 20px; }
      .logo img { border-radius: 12px; }
      .card h1 { font-size: 22px; }
      .card p { font-size: 14px; margin-bottom: 28px; }
      .google-btn { padding: 14px 28px; font-size: 16px; width: 100%; justify-content: center; }
      .footer { padding: 16px; font-size: 12px; }
    }
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
    <footer class="footer">Divinity Works \u2014 Your AI coworker with a real memory.</footer>
  </div>
</body>
</html>`;
const httpServer = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return;
  }
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const urlToken = url.searchParams.get("token") || url.searchParams.get("access_token");
  const cookieToken = (req.headers["cookie"] || "").match(/dw_access_token=([^;]+)/)?.[1];
  const bearerToken = (req.headers["authorization"] || "").match(/^Bearer\s+(.+)$/i)?.[1];
  const token = urlToken || cookieToken || bearerToken || null;
  if (!token || !isTokenValid(token)) {
    const reqPath = (req.url || "/").split("?")[0];
    const ext = extname(reqPath).toLowerCase();
    if (reqPath === "/" || ext === ".html" || ext === "") {
      res.writeHead(302, { "Location": "https://dash.divinityworks.space/signin" });
      res.end();
      return;
    }
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }
  if (urlToken) {
    res.setHeader("Set-Cookie", `dw_access_token=${urlToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
  }
  let urlPath = req.url?.split("?")[0] || "/";
  if (urlPath === "/") urlPath = "/web.html";
  const filePath = join(RENDERER_DIST, urlPath);
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      const ext = extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate"
      });
      res.end(data);
      return;
    }
  } catch (e) {
  }
  try {
    const fallbackPath = join(RENDERER_DIST, "web.html");
    const data = await readFile(fallbackPath);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
httpServer.listen(8790, () => {
  console.log("Divinity web bridge listening on http://localhost:8790");
  console.log("  Static files: " + RENDERER_DIST);
  console.log("  WebSocket: ws://localhost:8790/ws");
});
const clients = /* @__PURE__ */ new Set();
const subscriptions = /* @__PURE__ */ new Map();
function broadcastToClients(channel, payload) {
  const message = JSON.stringify({
    type: "event",
    channel,
    data: payload
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
function broadcastToSubscribers(channel, payload) {
  const subscribers = subscriptions.get(channel);
  if (!subscribers || subscribers.size === 0) return;
  const message = JSON.stringify({
    type: "event",
    channel,
    data: payload
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
function subscribeClient(client, channel) {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, /* @__PURE__ */ new Set());
  }
  subscriptions.get(channel).add(client);
}
function unsubscribeClient(client, channel) {
  const subscribers = subscriptions.get(channel);
  if (subscribers) {
    subscribers.delete(client);
    if (subscribers.size === 0) {
      subscriptions.delete(channel);
    }
  }
}
const clientAuthTokens = /* @__PURE__ */ new Map();
wss.on("connection", (ws, req) => {
  let authToken = "";
  if (req.headers["sec-websocket-protocol"]) {
    const protocols = req.headers["sec-websocket-protocol"].split(",").map((s) => s.trim());
    if (protocols[0] === "bearer" && protocols[1]) {
      authToken = protocols[1];
    }
  }
  if (authToken) {
    clientAuthTokens.set(ws, authToken);
    webTokens.set(ws, authToken);
    activeToken = authToken;
  }
  console.log("New client connected", authToken ? "(authenticated)" : "(anonymous)");
  clients.add(ws);
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      const wsToken = webTokens.get(ws);
      if (wsToken) activeToken = wsToken;
      if (message.type === "invoke") {
        handleInvoke(ws, message);
      } else if (message.type === "subscribe") {
        subscribeClient(ws, message.channel);
        ws.send(JSON.stringify({
          type: "response",
          reqId: message.reqId,
          result: { success: true }
        }));
      } else if (message.type === "unsubscribe") {
        unsubscribeClient(ws, message.channel);
        ws.send(JSON.stringify({
          type: "response",
          reqId: message.reqId,
          result: { success: true }
        }));
      }
    } catch (error) {
      console.error(`Error processing message: ${error}`);
      ws.send(JSON.stringify({
        type: "error",
        reqId: "unknown",
        error: `Invalid message format: ${error}`
      }));
    }
  });
  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
    clientAuthTokens.delete(ws);
    webTokens.delete(ws);
    for (const [channel, subscribers] of subscriptions) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        subscriptions.delete(channel);
      }
    }
  });
  ws.on("error", (error) => {
    console.error(`WebSocket error: ${error}`);
  });
});
async function handleInvoke(ws, message) {
  const { channel, reqId, args } = message;
  try {
    const validatedArgs = ipcShared.validateRequest(channel, args);
    let result;
    switch (channel) {
      // App channels
      case "app:getVersions":
        result = {
          chrome: "120.0.0.0",
          node: "20.0.0",
          electron: "39.0.0"
        };
        break;
      case "analytics:bootstrap":
        result = {
          installationId: getInstallationId(),
          apiUrl: API_URL,
          appVersion: "0.1.0"
        };
        break;
      case "app:consumePendingDeepLink":
        result = { url: consumePendingDeepLink() };
        break;
      // Workspace channels
      case "workspace:getRoot":
        result = await workspace.getRoot();
        break;
      case "workspace:exists":
        result = await workspace.exists(validatedArgs.path);
        break;
      case "workspace:stat":
        result = await workspace.stat(validatedArgs.path);
        break;
      case "workspace:readdir":
        result = await workspace.readdir(validatedArgs.path);
        break;
      case "workspace:readFile":
        result = await workspace.readFile(validatedArgs.path, validatedArgs.encoding);
        break;
      case "workspace:writeFile":
        result = await workspace.writeFile(validatedArgs.path, validatedArgs.content, validatedArgs.encoding);
        break;
      case "workspace:mkdir":
        result = await workspace.mkdir(validatedArgs.path, validatedArgs.recursive);
        break;
      case "workspace:rename":
        result = await workspace.rename(validatedArgs.from, validatedArgs.to);
        break;
      case "workspace:copy":
        result = await workspace.copy(validatedArgs.from, validatedArgs.to);
        break;
      case "workspace:remove":
        result = await workspace.remove(validatedArgs.path, validatedArgs.opts);
        break;
      // Sessions channels
      case "sessions:create":
        const sessions = container.resolve("sessions");
        const sessionId = await sessions.createSession(validatedArgs);
        result = { sessionId };
        break;
      case "sessions:list":
        const sessionsList = container.resolve("sessions").listSessions();
        result = { sessions: sessionsList };
        break;
      case "sessions:get":
        result = container.resolve("sessions").getSession(validatedArgs.sessionId);
        break;
      case "sessions:getTurn":
        result = container.resolve("sessions").getTurn(validatedArgs.turnId);
        break;
      case "sessions:sendMessage":
        result = container.resolve("sessions").sendMessage(
          validatedArgs.sessionId,
          validatedArgs.input,
          validatedArgs.config
        );
        break;
      case "sessions:respondToPermission":
        await container.resolve("sessions").respondToPermission(
          validatedArgs.turnId,
          validatedArgs.toolCallId,
          validatedArgs.decision,
          validatedArgs.metadata
        );
        result = { success: true };
        break;
      case "sessions:respondToAskHuman":
        await container.resolve("sessions").respondToAskHuman(
          validatedArgs.turnId,
          validatedArgs.toolCallId,
          validatedArgs.answer
        );
        result = { success: true };
        break;
      case "sessions:stopTurn":
        await container.resolve("sessions").stopTurn(
          validatedArgs.turnId,
          validatedArgs.reason
        );
        result = { success: true };
        break;
      case "sessions:resumeTurn":
        await container.resolve("sessions").resumeTurn(validatedArgs.sessionId);
        result = { success: true };
        break;
      case "sessions:setTitle":
        await container.resolve("sessions").setTitle(
          validatedArgs.sessionId,
          validatedArgs.title
        );
        result = { success: true };
        break;
      case "sessions:delete":
        await container.resolve("sessions").deleteSession(validatedArgs.sessionId);
        result = { success: true };
        break;
      // Runs channels
      case "runs:create":
        result = await runsCore.createRun(validatedArgs);
        break;
      case "runs:createMessage":
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
      case "runs:authorizePermission":
        await runsCore.authorizePermission(validatedArgs.runId, validatedArgs.authorization);
        result = { success: true };
        break;
      case "runs:provideHumanInput":
        await runsCore.replyToHumanInputRequest(validatedArgs.runId, validatedArgs.reply);
        result = { success: true };
        break;
      case "runs:stop":
        await runsCore.stop(validatedArgs.runId, validatedArgs.force);
        result = { success: true };
        break;
      case "runs:fetch":
        result = await runsCore.fetchRun(validatedArgs.runId);
        break;
      case "runs:list":
        result = await runsCore.listRuns(validatedArgs.cursor);
        break;
      case "runs:listByWorkDir":
        result = await runsCore.listRunsByWorkDir(validatedArgs.dir);
        break;
      case "runs:delete":
        await runsCore.deleteRun(validatedArgs.runId);
        result = { success: true };
        break;
      // Models channels
      case "models:list":
        if (await isSignedIn()) {
          result = await listGatewayModels();
        } else {
          result = await listOnboardingModels();
        }
        break;
      case "models:test":
        result = await testModelConnection(validatedArgs.provider, validatedArgs.model);
        break;
      case "models:listForProvider":
        try {
          const models = await listModelsForProvider(validatedArgs.provider);
          result = { success: true, models };
        } catch (err) {
          const message2 = err instanceof Error ? err.message : "Failed to list models";
          result = { success: false, error: message2 };
        }
        break;
      case "llm:getDefaultModel":
        result = await getDefaultModelAndProvider();
        break;
      case "llm:generate":
        result = await generateOneShot(validatedArgs);
        break;
      // Search channel
      case "search:query": {
        const sessions2 = container.resolve("sessions").listSessions().map((s) => ({ sessionId: s.sessionId, title: s.title }));
        result = await search(validatedArgs.query, validatedArgs.limit, validatedArgs.types, sessions2);
        break;
      }
      // Gmail channels
      case "gmail:getImportant":
        result = await listImportantThreads({ cursor: validatedArgs.cursor, limit: validatedArgs.limit });
        break;
      case "gmail:getEverythingElse":
        result = await listEverythingElseThreads({ cursor: validatedArgs.cursor, limit: validatedArgs.limit });
        break;
      case "gmail:triggerSync":
        triggerGmailSync();
        result = {};
        break;
      case "gmail:sendReply":
        result = await sendThreadReply(validatedArgs);
        break;
      case "gmail:saveDraft":
        result = await saveThreadDraft(validatedArgs);
        break;
      case "gmail:deleteDraft":
        result = await deleteThreadDraft(validatedArgs.draftId);
        break;
      case "gmail:getDrafts":
        result = await listDraftThreads();
        break;
      case "gmail:search":
        result = await searchThreads(validatedArgs.query, { limit: validatedArgs.limit });
        break;
      case "gmail:getConnectionStatus":
        result = await getGmailConnectionStatus();
        break;
      case "gmail:getAccountEmail":
        result = { email: await getAccountEmail() };
        break;
      case "gmail:getAccountName":
        result = { name: await getAccountName() };
        break;
      case "gmail:setImportance":
        const setImportanceResult = setThreadImportance(validatedArgs.threadId, validatedArgs.importance);
        result = { ok: setImportanceResult.success, previous: setImportanceResult.previous, error: setImportanceResult.error };
        break;
      case "gmail:archiveThread":
        result = await archiveThread(validatedArgs.threadId);
        break;
      case "gmail:trashThread":
        result = await trashThread(validatedArgs.threadId);
        break;
      case "gmail:markThreadRead":
        result = await markThreadRead(validatedArgs.threadId, validatedArgs.read);
        break;
      case "gmail:downloadAttachment":
        result = await downloadAttachment(validatedArgs);
        break;
      case "gmail:saveMessageHeight":
        saveMessageBodyHeight(validatedArgs.threadId, validatedArgs.messageId, validatedArgs.height);
        result = {};
        break;
      case "gmail:searchContacts":
        const query = validatedArgs?.query ?? "";
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
      case "knowledge:history":
        result = { commits: await versionHistory.getFileHistory(validatedArgs.path) };
        break;
      case "knowledge:fileAtCommit":
        result = { content: await versionHistory.getFileAtCommit(validatedArgs.path, validatedArgs.oid) };
        break;
      case "knowledge:restore":
        await versionHistory.restoreFile(validatedArgs.path, validatedArgs.oid);
        result = { ok: true };
        break;
      // Live note channels
      case "live-note:run":
        const liveNoteResult = await runLiveNoteAgent(validatedArgs.filePath, "manual", validatedArgs.context);
        result = {
          success: !liveNoteResult.error,
          runId: liveNoteResult.runId,
          action: liveNoteResult.action,
          summary: liveNoteResult.summary,
          contentAfter: liveNoteResult.contentAfter,
          error: liveNoteResult.error
        };
        break;
      case "live-note:get":
        try {
          const live = await fetchLiveNote(validatedArgs.filePath);
          result = { success: true, live };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "live-note:set":
        try {
          await setLiveNote(validatedArgs.filePath, validatedArgs.live);
          const live = await fetchLiveNote(validatedArgs.filePath);
          result = { success: true, live };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "live-note:setActive":
        try {
          await setLiveNoteActive(validatedArgs.filePath, validatedArgs.active);
          const live = await fetchLiveNote(validatedArgs.filePath);
          result = { success: true, live };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "live-note:delete":
        try {
          await deleteLiveNote(validatedArgs.filePath);
          result = { success: true };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "live-note:stop":
        try {
          const live = await fetchLiveNote(validatedArgs.filePath);
          if (!live?.lastRunId) {
            result = { success: false, error: "No active run for this note" };
          } else {
            await runsCore.stop(live.lastRunId, false);
            result = { success: true };
          }
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "live-note:listNotes":
        result = { notes: await listLiveNotes() };
        break;
      // Background task channels
      case "bg-task:run":
        const bgTaskResult = await runBackgroundTask(validatedArgs.slug, "manual", validatedArgs.context);
        result = {
          success: !bgTaskResult.error,
          runId: bgTaskResult.runId,
          summary: bgTaskResult.summary,
          error: bgTaskResult.error
        };
        break;
      case "bg-task:get":
        try {
          const task = await fetchTask(validatedArgs.slug);
          result = { success: true, task };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "bg-task:patch":
        try {
          const task = await patchTask(validatedArgs.slug, validatedArgs.partial);
          result = { success: true, task };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "bg-task:create":
        try {
          const { slug } = await createTask({
            name: validatedArgs.name,
            instructions: validatedArgs.instructions,
            ...validatedArgs.triggers ? { triggers: validatedArgs.triggers } : {},
            ...validatedArgs.projectId ? { projectId: validatedArgs.projectId } : {},
            ...validatedArgs.model ? { model: validatedArgs.model } : {},
            ...validatedArgs.provider ? { provider: validatedArgs.provider } : {}
          });
          result = { success: true, slug };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "bg-task:delete":
        try {
          await deleteTask(validatedArgs.slug);
          result = { success: true };
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "bg-task:stop":
        try {
          const task = await fetchTask(validatedArgs.slug);
          if (!task?.lastRunId) {
            result = { success: false, error: "No active run for this task" };
          } else {
            await runsCore.stop(task.lastRunId, false);
            result = { success: true };
          }
        } catch (err) {
          result = { success: false, error: err instanceof Error ? err.message : String(err) };
        }
        break;
      case "bg-task:list":
        result = await listTasks(validatedArgs);
        break;
      case "bg-task:listRunIds":
        const runIds = await readTaskRunIds(validatedArgs.slug, validatedArgs.limit);
        result = { runIds };
        break;
      // Billing channel
      case "billing:getInfo":
        result = await getBillingInfo();
        break;
      // Notifications channels
      case "notifications:getSettings":
        result = loadNotificationSettings();
        break;
      case "notifications:setSettings":
        saveNotificationSettings(validatedArgs);
        result = { success: true };
        break;
      // Voice channels
      case "voice:getConfig":
        result = voice.getVoiceConfig();
        break;
      case "voice:synthesize":
        result = voice.synthesizeSpeech(validatedArgs.text);
        break;
      // Meeting channels
      case "meeting:summarize":
        const notes = await summarizeMeeting(validatedArgs.transcript, validatedArgs.meetingStartTime, validatedArgs.calendarEventJson);
        result = { notes };
        break;
      case "meeting-prep:resolve":
        const prepResult = await resolveMeetingPrep(validatedArgs.attendees);
        const prepNote = validatedArgs.eventId ? await readPrepNoteForEvent(validatedArgs.eventId) : null;
        result = { ...prepResult, prepNote };
        break;
      case "inline-task:classifySchedule":
        const schedule = await classifySchedule(validatedArgs.instruction);
        result = { schedule };
        break;
      case "inline-task:process":
        result = await processRowboatInstruction(validatedArgs.instruction, validatedArgs.noteContent, validatedArgs.notePath);
        break;
      // Google Docs channels
      case "google-docs:getStatus":
        result = getGoogleDocsConnectionStatus();
        break;
      case "google-docs:import":
        try {
          const importResult = await importGoogleDoc(validatedArgs.fileId, validatedArgs.targetFolder);
          result = importResult;
        } catch (err) {
          throw err;
        }
        break;
      case "google-docs:pickViaManaged":
        const pickResult = await startManagedGooglePick(validatedArgs.targetFolder);
        result = pickResult;
        break;
      case "google-docs:refreshSnapshot":
        result = await syncGoogleDocDown(validatedArgs.path);
        break;
      case "google-docs:sync":
        result = await syncGoogleDocUp(validatedArgs.path, { force: validatedArgs.force });
        break;
      case "google-docs:getLink":
        result = { link: await getGoogleDocLink(validatedArgs.path) };
        break;
      // OAuth channels
      case "oauth:connect": {
        const workerToken = clientAuthTokens.get(ws) || "";
        if (validatedArgs.provider === "rowboat") {
          if (workerToken) {
            ws.send(JSON.stringify({
              type: "event",
              channel: "oauth:didConnect",
              event: { provider: "rowboat", success: true }
            }));
            result = { success: true };
            break;
          }
          result = { redirect: "https://dash.divinityworks.space/signin" };
          break;
        }
        const credentials = validatedArgs.clientId && validatedArgs.clientSecret ? { clientId: validatedArgs.clientId.trim(), clientSecret: validatedArgs.clientSecret.trim() } : void 0;
        result = await connectProvider(validatedArgs.provider, credentials);
        break;
      }
      case "oauth:disconnect": {
        if (validatedArgs.provider === "rowboat") {
          result = { redirect: "https://dash.divinityworks.space/auth/logout" };
          break;
        }
        result = await disconnectProvider(validatedArgs.provider);
        break;
      }
      case "oauth:list-providers":
        result = listProviders();
        break;
      case "oauth:getState": {
        const oauthRepo = container.resolve("oauthRepo");
        const config = await oauthRepo.getClientFacingConfig();
        result = { config };
        break;
      }
      // Account channels
      case "account:getRowboat": {
        const workerToken = clientAuthTokens.get(ws) || "";
        if (workerToken) {
          const config = await getRowboatConfig();
          result = { signedIn: true, accessToken: workerToken, config };
        } else {
          result = { signedIn: false, accessToken: null, config: null };
        }
        break;
      }
      // Granola channels
      case "granola:getConfig":
        const granolaConfigRepo = container.resolve("granolaConfigRepo");
        const granolaConfig = await granolaConfigRepo.getConfig();
        result = { enabled: granolaConfig.enabled };
        break;
      case "granola:setConfig":
        const granolaRepo = container.resolve("granolaConfigRepo");
        await granolaRepo.setConfig({ enabled: validatedArgs.enabled });
        if (validatedArgs.enabled) {
          triggerGranolaSync();
        }
        result = { success: true };
        break;
      // Code mode channels
      case "codeMode:getConfig":
        const codeModeConfigRepo = container.resolve("codeModeConfigRepo");
        const codeModeConfig = await codeModeConfigRepo.getConfig();
        result = { enabled: codeModeConfig.enabled, approvalPolicy: codeModeConfig.approvalPolicy };
        break;
      case "codeMode:setConfig":
        const codeModeRepo = container.resolve("codeModeConfigRepo");
        await codeModeRepo.setConfig({ enabled: validatedArgs.enabled, approvalPolicy: validatedArgs.approvalPolicy });
        invalidateCopilotInstructionsCache();
        result = { success: true };
        break;
      case "codeMode:checkAgentStatus":
        result = await checkCodeModeAgentStatus();
        break;
      case "codeMode:provisionEngine":
        try {
          await ensureEngine(validatedArgs.agent, {
            onProgress: () => {
            }
          });
          result = { success: true };
        } catch (e) {
          result = { success: false, error: e instanceof Error ? e.message : String(e) };
        }
        break;
      // Channels channels
      case "channels:getConfig":
        result = container.resolve("channelsConfigRepo").getConfig();
        break;
      case "channels:setConfig":
        await container.resolve("channelsConfigRepo").setConfig(validatedArgs);
        await applyChannelsConfig(validatedArgs);
        result = { success: true };
        break;
      case "channels:getStatus":
        result = getChannelsStatus();
        break;
      case "channels:whatsappLogout":
        await logoutWhatsApp();
        result = { success: true };
        break;
      // Slack channels
      case "slack:getConfig":
        const slackConfigRepo = container.resolve("slackConfigRepo");
        const slackConfig = await slackConfigRepo.getConfig();
        result = { enabled: slackConfig.enabled, workspaces: slackConfig.workspaces };
        break;
      case "slack:setConfig":
        const slackRepo = container.resolve("slackConfigRepo");
        await slackRepo.setConfig({ enabled: validatedArgs.enabled, workspaces: validatedArgs.workspaces });
        invalidateCopilotInstructionsCache();
        result = { success: true };
        break;
      case "slack:cliStatus":
        result = await getAgentSlackCliStatus();
        break;
      case "slack:knowledgeStatus":
        result = {
          cli: await getAgentSlackCliStatus(),
          sources: getSlackKnowledgeSyncStatus()
        };
        break;
      case "slack:listWorkspaces":
        const whoamiResult = await runAgentSlack(["auth", "whoami"], { timeoutMs: 1e4 });
        if (!whoamiResult.ok) {
          result = { workspaces: [], error: whoamiResult.message, errorKind: whoamiResult.kind };
        } else {
          const workspaces = parseWhoamiWorkspaces(whoamiResult.data);
          result = { workspaces };
        }
        break;
      case "slack:importDesktopAuth":
        const imported = await runAgentSlack(["auth", "import-desktop"], { timeoutMs: 2e4, parseJson: false });
        if (!imported.ok) {
          result = { ok: false, workspaces: [], error: imported.message, errorKind: imported.kind };
        } else {
          const whoami = await runAgentSlack(["auth", "whoami"], { timeoutMs: 1e4 });
          if (!whoami.ok) {
            result = { ok: false, workspaces: [], error: whoami.message, errorKind: whoami.kind };
          } else {
            const workspaces = parseWhoamiWorkspaces(whoami.data);
            if (workspaces.length === 0) {
              result = { ok: false, workspaces: [], error: "No signed-in Slack workspaces found in the desktop app.", errorKind: "not_authed" };
            } else {
              result = { ok: true, workspaces };
            }
          }
        }
        break;
      case "slack:quitAndImportDesktop":
        result = { ok: false, workspaces: [], error: "Not implemented for non-Windows platforms", errorKind: "not_supported" };
        break;
      case "slack:parseCurlAuth":
        const curl = (validatedArgs.curl ?? "").trim();
        if (!curl) {
          result = { ok: false, workspaces: [], error: "Paste the copied cURL command first.", errorKind: "unknown" };
        } else {
          const imported2 = await runAgentSlack(["auth", "parse-curl"], { timeoutMs: 15e3, parseJson: false, input: curl });
          if (!imported2.ok) {
            result = { ok: false, workspaces: [], error: imported2.message, errorKind: imported2.kind };
          } else {
            const whoami = await runAgentSlack(["auth", "whoami"], { timeoutMs: 1e4 });
            if (!whoami.ok) {
              result = { ok: false, workspaces: [], error: whoami.message, errorKind: whoami.kind };
            } else {
              const workspaces = parseWhoamiWorkspaces(whoami.data);
              if (workspaces.length === 0) {
                result = { ok: false, workspaces: [], error: "Tokens were saved but no workspace was found. Double-check the copied request.", errorKind: "not_authed" };
              } else {
                result = { ok: true, workspaces };
              }
            }
          }
        }
        break;
      case "slack:listChannels":
        const channelResult = await runAgentSlack(["channel", "list", "--all", "--workspace", validatedArgs.workspaceUrl, "--limit", "200"], { timeoutMs: 15e3 });
        if (!channelResult.ok) {
          result = { channels: [], error: channelResult.message };
        } else {
          const rawChannels = extractArrayPayload(channelResult.data);
          const channels = rawChannels.map((ch) => ({
            id: ch.id || ch.name || "",
            name: ch.name || ch.id || "",
            isPrivate: ch.is_private ?? ch.isPrivate,
            isMember: ch.is_member ?? ch.isMember
          })).filter((ch) => ch.id && ch.name);
          result = { channels };
        }
        break;
      case "slack:getRecentMessages":
        const slackConfig2 = await container.resolve("slackConfigRepo").getConfig();
        if (!slackConfig2.enabled || slackConfig2.workspaces.length === 0) {
          result = { enabled: false, messages: [] };
        } else {
          const limit2 = Math.min(Math.max(validatedArgs.limit ?? 5, 1), 20);
          const messages = [];
          const userNameCache = /* @__PURE__ */ new Map();
          try {
            const knowledgeConfig = knowledgeSourcesRepo.getConfig();
            const slackSource = knowledgeConfig.sources.find((source) => source.id === "slack" && source.provider === "slack" && source.enabled);
            let channels = (slackSource?.scopes ?? []).filter((scope) => scope.type === "channel").map((scope) => ({
              id: scope.id,
              name: scope.name ?? scope.id,
              workspaceUrl: scope.workspaceUrl,
              workspaceName: slackConfig2.workspaces.find((workspace2) => workspace2.url === scope.workspaceUrl)?.name
            }));
            if (channels.length === 0) {
              for (const workspace2 of slackConfig2.workspaces) {
                const channelList = await runAgentSlack(["channel", "list", "--workspace", workspace2.url, "--limit", "12"], { timeoutMs: 15e3 });
                if (!channelList.ok) {
                  throw new AgentSlackRunError(channelList.kind, channelList.message);
                }
                const rawChannels = extractArrayPayload(channelList.data);
                for (const raw of rawChannels) {
                  if (!raw || typeof raw !== "object") continue;
                  const channel2 = raw;
                  const id = typeof channel2.id === "string" ? channel2.id : void 0;
                  const name = typeof channel2.name === "string" ? channel2.name : id;
                  const isMember = channel2.is_member ?? channel2.isMember;
                  if (!id || !name || isMember === false) continue;
                  channels.push({ id, name, workspaceUrl: workspace2.url, workspaceName: workspace2.name });
                }
              }
            }
            channels = channels.slice(0, 8);
            for (const channel2 of channels) {
              const commandArgs = ["message", "list", channel2.id, "--limit", "5", "--max-body-chars", "500"];
              if (channel2.workspaceUrl) {
                commandArgs.push("--workspace", channel2.workspaceUrl);
              }
              const messageList = await runAgentSlack(commandArgs, { timeoutMs: 15e3, maxBuffer: 1024 * 1024 });
              if (!messageList.ok) {
                console.warn(`[Slack] Failed to load messages for ${channel2.name}: ${messageList.message}`);
                continue;
              }
              const rawMessages = extractArrayPayload(messageList.data);
              for (const raw of rawMessages) {
                if (!raw || typeof raw !== "object") continue;
                const message2 = raw;
                const ts = typeof message2.ts === "string" ? message2.ts : void 0;
                const text = slackMessageText(message2);
                if (!ts || !text) continue;
                const channelId = typeof message2.channel_id === "string" ? message2.channel_id : typeof message2.channel === "string" ? message2.channel : channel2.id;
                const resolvedAuthor = await resolveSlackAuthor(slackMessageAuthor(message2), channel2.workspaceUrl, userNameCache);
                const resolvedText = await resolveSlackMessageText(text, channel2.workspaceUrl, userNameCache);
                messages.push({
                  id: `${channel2.workspaceUrl ?? "workspace"}:${channelId}:${ts}`,
                  workspaceName: channel2.workspaceName,
                  workspaceUrl: channel2.workspaceUrl,
                  channelId,
                  channelName: channel2.name,
                  author: resolvedAuthor,
                  text: resolvedText,
                  ts,
                  url: slackMessageUrl(message2, channel2.workspaceUrl, channelId, ts)
                });
              }
            }
            const rankedIds = await rankSlackHomeMessages(messages, limit2);
            const byId = new Map(messages.map((message2) => [message2.id, message2]));
            const rankedMessages = rankedIds.map((id) => byId.get(id)).filter((message2) => Boolean(message2));
            result = { enabled: true, messages: rankedMessages };
          } catch (err) {
            const message2 = err instanceof Error ? err.message : "Failed to load Slack messages";
            const errorKind = err instanceof AgentSlackRunError ? err.kind : void 0;
            result = { enabled: true, messages: [], error: message2, errorKind };
          }
        }
        break;
      // Knowledge sources channels
      case "knowledgeSources:getConfig":
        result = knowledgeSourcesRepo.getConfig();
        break;
      case "knowledgeSources:upsert": {
        const config = knowledgeSourcesRepo.upsertSource(validatedArgs);
        if (validatedArgs.provider === "slack") {
          invalidateCopilotInstructionsCache();
          triggerSlackKnowledgeSync();
          void syncSlackKnowledgeSources().catch((error) => {
            console.error("[SlackKnowledge] Immediate sync after settings update failed:", error);
          });
        }
        result = config;
        break;
      }
      // Onboarding channels
      case "onboarding:getStatus":
        const complete = isOnboardingComplete();
        result = { showOnboarding: !complete };
        break;
      case "onboarding:markComplete":
        markOnboardingComplete();
        result = { success: true };
        break;
      // Composio channels
      case "composio:is-configured":
        result = { configured: false };
        break;
      case "composio:set-api-key":
        result = { success: false, error: "Not implemented" };
        break;
      case "composio:initiate-connection":
        result = { success: false, error: "Not implemented" };
        break;
      case "composio:get-connection-status":
        result = { success: false, error: "Not implemented" };
        break;
      case "composio:sync-connection":
        result = { success: false, error: "Not implemented" };
        break;
      case "composio:disconnect":
        result = { success: false, error: "Not implemented" };
        break;
      case "composio:list-connected":
        result = { connected: [] };
        break;
      case "composio:list-toolkits":
        result = { toolkits: [] };
        break;
      case "composio:execute-tool":
        result = { success: false, error: "Not implemented" };
        break;
      case "composio:search-tools":
        result = { tools: [] };
        break;
      // Migration channels
      case "migration:check-composio-google":
        result = { needsMigration: false };
        break;
      // Apps channels
      case "apps:serverStatus":
        result = appsServer.getServerStatus();
        break;
      case "apps:list":
        const status = appsServer.getServerStatus();
        const apps = await appsIndexer.listApps();
        for (const app2 of apps) {
          if (app2.agentSlugs.length) await appsAgents.syncAppAgents(app2);
        }
        const fingerprint = JSON.stringify(apps.map((a) => [a.folder, a.manifest?.name, a.manifest?.description, a.hasDist]));
        result = {
          serverRunning: status.running,
          ...status.error ? { serverError: status.error } : {},
          apps
        };
        break;
      case "apps:get":
        const app = await appsIndexer.getApp(validatedArgs.folder);
        if (!app) throw new Error(`no such app: ${validatedArgs.folder}`);
        const readme = await appsIndexer.readAppReadme(validatedArgs.folder);
        result = {
          app,
          ...readme ? { readme } : {},
          rollbackAvailable: await appsIndexer.rollbackAvailable(validatedArgs.folder)
        };
        break;
      case "apps:create":
        const createdApp = await appsIndexer.createApp(validatedArgs);
        result = { app: createdApp };
        break;
      case "apps:delete":
        await appsIndexer.deleteApp(validatedArgs.folder);
        result = { ok: true };
        break;
      case "apps:setTheme":
        appsServer.setAppsTheme(validatedArgs.theme);
        result = { ok: true };
        break;
      case "apps:catalogIndex":
        result = registryClient.refreshIndex(validatedArgs.force);
        break;
      case "apps:catalogSearch":
        result = { records: await registryClient.search(validatedArgs.query) };
        break;
      case "apps:catalogStars":
        const [stars, starred] = await Promise.all([
          appsStars.repoStars(validatedArgs.repos),
          appsStars.starredStatus(validatedArgs.repos)
        ]);
        result = { stars, starred };
        break;
      case "apps:star":
        const starResult = await appsStars.setStar(validatedArgs.repo, validatedArgs.star);
        result = starResult;
        break;
      case "apps:catalogDetail": {
        const record = await registryClient.resolve(validatedArgs.name);
        if (!record) throw new Error(`no such app in the catalog: ${validatedArgs.name}`);
        let manifest;
        try {
          manifest = await registryClient.latestManifest(record);
        } catch {
        }
        let catReadme;
        try {
          const res = await fetch(`https://raw.githubusercontent.com/${record.repo}/HEAD/README.md`);
          if (res.ok) catReadme = await res.text();
        } catch {
        }
        const installed = (await appsIndexer.listApps()).find((a) => a.install?.name === validatedArgs.name);
        result = {
          record,
          ...manifest ? { manifest } : {},
          ...catReadme ? { readme: catReadme } : {},
          ...installed ? { installedFolder: installed.folder } : {}
        };
        break;
      }
      case "apps:install":
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
      case "apps:installFromUrl":
        if (!validatedArgs.confirmed) {
          result = appsInstaller.previewUrlInstall(validatedArgs.url);
        } else {
          const installResult = await appsInstaller.confirmUrlInstall(validatedArgs.url);
          result = installResult;
        }
        break;
      case "apps:uninstall":
        await appsInstaller.uninstallApp(validatedArgs.folder);
        result = { ok: true };
        break;
      case "apps:checkUpdate":
        result = appsInstaller.checkUpdate(validatedArgs.folder);
        break;
      case "apps:update":
        const before = (await appsIndexer.getApp(validatedArgs.folder))?.manifest?.version;
        const updatedApp = await appsInstaller.updateApp(validatedArgs.folder, {
          confirmOverwriteModified: validatedArgs.confirmOverwriteModified,
          confirmNewCapabilities: validatedArgs.confirmNewCapabilities
        });
        result = { app: updatedApp };
        break;
      case "apps:rollback":
        result = { app: await appsInstaller.rollbackApp(validatedArgs.folder) };
        break;
      case "apps:publish":
        result = appsPublisher.publishApp(validatedArgs.folder, () => {
        });
        break;
      case "apps:publishUpdate":
        result = appsPublisher.publishUpdate(validatedArgs.folder, validatedArgs.increment);
        break;
      case "apps:registerExisting":
        result = appsPublisher.registerExisting(validatedArgs.name, validatedArgs.repo);
        break;
      // GitHub auth channels
      case "githubAuth:start":
        result = { device_code: "stub", user_code: "stub", verification_uri: "https://example.com", expires_in: 600 };
        break;
      case "githubAuth:poll":
        result = { status: "pending", device_code: "stub" };
        break;
      case "githubAuth:status":
        result = { authenticated: false };
        break;
      case "githubAuth:signOut":
        result = { ok: true };
        break;
      // Agent schedule channels
      case "agent-schedule:getConfig":
        const agentScheduleRepo = container.resolve("agentScheduleRepo");
        try {
          result = await agentScheduleRepo.getConfig();
        } catch {
          result = { agents: {} };
        }
        break;
      case "agent-schedule:getState":
        const agentScheduleStateRepo = container.resolve("agentScheduleStateRepo");
        try {
          result = await agentScheduleStateRepo.getState();
        } catch {
          result = { agents: {} };
        }
        break;
      case "agent-schedule:updateAgent":
        const repo = container.resolve("agentScheduleRepo");
        await repo.upsert(validatedArgs.agentName, validatedArgs.entry);
        triggerAgentScheduleRun();
        result = { success: true };
        break;
      case "agent-schedule:deleteAgent":
        const stateRepo = container.resolve("agentScheduleStateRepo");
        await repo.delete(validatedArgs.agentName);
        await stateRepo.deleteAgentState(validatedArgs.agentName);
        result = { success: true };
        break;
      // Shell channels
      case "shell:openPath":
        result = { error: "Not implemented" };
        break;
      case "shell:showItemInFolder":
        result = { success: true };
        break;
      case "shell:readFileBase64":
        result = { error: "Not implemented" };
        break;
      // Terminal channels
      case "terminal:ensure":
        result = { success: false, error: "Not implemented" };
        break;
      case "terminal:input":
        result = { success: false, error: "Not implemented" };
        break;
      case "terminal:resize":
        result = { success: false, error: "Not implemented" };
        break;
      case "terminal:dispose":
        result = { success: false, error: "Not implemented" };
        break;
      // Dialog channels
      case "dialog:openDirectory":
        result = { path: null };
        break;
      case "dialog:openFiles":
        result = { paths: [] };
        break;
      // Video channels
      case "video:setPopout":
        result = {};
        break;
      case "video:popoutState":
        result = {};
        break;
      case "video:getPopoutState":
        result = { state: null };
        break;
      case "video:popoutAction":
        result = {};
        break;
      // Auto-update channels
      case "update:check":
        result = { ok: false, error: "Not implemented" };
        break;
      case "update:install":
        result = { ok: false, error: "Not implemented" };
        break;
      case "update:dismiss":
        result = { ok: true };
        break;
      // Default case for unimplemented channels
      default:
        console.warn(`Unhandled IPC channel: ${channel}`);
        result = { error: `Channel not implemented: ${channel}` };
        break;
    }
    ws.send(JSON.stringify({
      type: "response",
      reqId,
      result
    }));
  } catch (error) {
    console.error(`Error handling invoke for ${channel}:`, error);
    ws.send(JSON.stringify({
      type: "error",
      reqId,
      error: error instanceof Error ? error.message : String(error)
    }));
  }
}
function setupEventBroadcasting() {
  bus.subscribe("*", async (event) => {
    broadcastToSubscribers("runs:events", event);
  });
  serviceBus.subscribe(async (event) => {
    broadcastToSubscribers("services:events", event);
  });
  const sessionBus = container.resolve("sessionBus");
  sessionBus.subscribe((event) => {
    broadcastToSubscribers("sessions:events", event);
  });
  const turnEventBus = container.resolve("turnEventBus");
  turnEventBus.subscribeAll((event) => {
    if (isDurableTurnEvent(event.event)) {
      broadcastToSubscribers("turns:events", event);
      return;
    }
  });
  const codeRunFeed = container.resolve("codeRunFeed");
  codeRunFeed.subscribe((event) => {
    broadcastToSubscribers("codeRun:events", event);
  });
  liveNoteBus.subscribe((event) => {
    broadcastToSubscribers("live-note-agent:events", event);
  });
  backgroundTaskBus.subscribe((event) => {
    broadcastToSubscribers("bg-task-agent:events", event);
  });
}
setupEventBroadcasting();
process.on("SIGTERM", () => {
  console.log("SIGTERM received, closing WebSocket server");
  wss.close();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("SIGINT received, closing WebSocket server");
  wss.close();
  process.exit(0);
});
