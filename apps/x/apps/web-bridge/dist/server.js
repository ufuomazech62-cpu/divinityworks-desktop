import { WebSocketServer, WebSocket } from "ws";
import { resolve } from "path";
import { homedir } from "os";
import { initConfigs } from "@x/core/dist/config/initConfigs.js";
import container from "@x/core/dist/di/container.js";
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
import { getAccessToken } from "@x/core/dist/auth/tokens.js";
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
        "Cache-Control": "public, max-age=3600"
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
wss.on("connection", (ws) => {
  console.log("New client connected");
  clients.add(ws);
  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
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
        result = workspace.getRoot();
        break;
      case "workspace:exists":
        result = await workspace.exists(validatedArgs.path);
        break;
      case "workspace:stat":
        result = await workspace.stat(validatedArgs.path);
        break;
      case "workspace:readdir":
        result = await workspace.readdir(validatedArgs.path, validatedArgs.opts);
        break;
      case "workspace:readFile":
        result = await workspace.readFile(validatedArgs.path, validatedArgs.encoding);
        break;
      case "workspace:writeFile":
        result = await workspace.writeFile(validatedArgs.path, validatedArgs.data, validatedArgs.opts);
        break;
      case "workspace:mkdir":
        result = await workspace.mkdir(validatedArgs.path, validatedArgs.recursive);
        break;
      case "workspace:rename":
        result = await workspace.rename(validatedArgs.from, validatedArgs.to, validatedArgs.overwrite);
        break;
      case "workspace:copy":
        result = await workspace.copy(validatedArgs.from, validatedArgs.to, validatedArgs.overwrite);
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
      case "oauth:connect":
        const credentials = validatedArgs.clientId && validatedArgs.clientSecret ? { clientId: validatedArgs.clientId.trim(), clientSecret: validatedArgs.clientSecret.trim() } : void 0;
        result = await connectProvider(validatedArgs.provider, credentials);
        break;
      case "oauth:disconnect":
        result = await disconnectProvider(validatedArgs.provider);
        break;
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
      case "account:getRowboat":
        const signedIn = await isSignedIn();
        if (!signedIn) {
          result = { signedIn: false, accessToken: null, config: null };
        } else {
          const config = await getRowboatConfig();
          try {
            const accessToken = await getAccessToken();
            result = { signedIn: true, accessToken, config };
          } catch {
            result = { signedIn: true, accessToken: null, config };
          }
        }
        break;
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
