import { WebSocketServer, WebSocket } from 'ws';
import { resolve } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';
import { createHmac, timingSafeEqual } from 'crypto';
import { WorkDir } from '@x/core/dist/config/config.js';
import { initConfigs } from '@x/core/dist/config/initConfigs.js';
import container from '@x/core/dist/di/container.js';
import { asClass, asValue } from 'awilix';
import { ipc as ipcShared } from '@x/shared';
// Set ROWBOAT_WORKDIR to ~/.divinity for the workspace
process.env.ROWBOAT_WORKDIR = resolve(homedir(), '.divinity');
// Initialize configs before using the container
initConfigs();
// Import all the core functions — real direct-path imports matching apps/main/src/ipc.ts
import { workspace, versionHistory, voice } from '@x/core';
import { userWorkDirStorage } from '@x/core/dist/config/config.js';
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
import { getRowboatConfig } from '@x/core/dist/config/rowboat.js';
import { runLiveNoteAgent } from '@x/core/dist/knowledge/live-note/runner.js';
import { composioAccountsRepo } from '@x/core/dist/composio/repo.js';
import { listImportantThreads, listEverythingElseThreads, saveMessageBodyHeight, triggerSync as triggerGmailSync, sendThreadReply, saveThreadDraft, deleteThreadDraft, listDraftThreads, searchThreads, archiveThread, trashThread, markThreadRead, downloadAttachment, getAccountEmail, getAccountName, getConnectionStatus as getGmailConnectionStatus, setThreadImportance, } from '@x/core/dist/knowledge/sync_gmail.js';
import { searchContacts as searchGmailContacts } from '@x/core/dist/knowledge/gmail_contacts.js';
import { searchSentContacts } from '@x/core/dist/knowledge/gmail_sent_contacts.js';
import { getGoogleDocsConnectionStatus, importGoogleDoc, syncGoogleDocDown, syncGoogleDocUp, getGoogleDocLink, } from '@x/core/dist/knowledge/google_docs.js';
import { liveNoteBus } from '@x/core/dist/knowledge/live-note/bus.js';
import { getInstallationId } from '@x/core/dist/analytics/installation.js';
import { API_URL } from '@x/core/dist/config/env.js';
import { fetchLiveNote, setLiveNote, setLiveNoteActive, deleteLiveNote, listLiveNotes, } from '@x/core/dist/knowledge/live-note/fileops.js';
import { runBackgroundTask } from '@x/core/dist/background-tasks/runner.js';
import { backgroundTaskBus } from '@x/core/dist/background-tasks/bus.js';
import { fetchTask, patchTask, createTask, deleteTask, listTasks, readRunIds as readTaskRunIds, } from '@x/core/dist/background-tasks/fileops.js';
import { triggerRun as triggerAgentScheduleRun } from '@x/core/dist/agent-schedule/runner.js';
import { isDurableTurnEvent } from '@x/shared/dist/turns.js';
// Per-user session infrastructure
import { SessionsImpl } from '@x/core/dist/runtime/sessions/sessions.js';
import { TurnRuntime } from '@x/core/dist/runtime/turns/runtime.js';
import { createContextResolver } from '@x/core/dist/runtime/turns/context-elision.js';
import { EmitterSessionBus } from '@x/core/dist/runtime/sessions/bus.js';
import { TurnEventHub } from '@x/core/dist/runtime/turns/event-hub.js';
import path from 'path';
import fs from 'fs';
import { CDPBrowserControlService } from './cdp-browser-service.js';
// Database-backed repositories (PostgreSQL + Redis)
import { DBSessionRepo, DBTurnRepo, getDbPool, BrowserSessionRepo } from './db/db.js';
import { getRedisCache } from './db/redis.js';
// ── Legal pages (Terms & Privacy) ────────────────────────────────
// Served at /terms and /privacy — public, no auth required.
function legalShell(title, bodyHtml) {
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Divinity Works</title>
<style>
  :root { --bg:#0a0a0b; --card:#151517; --text:#e8e8e8; --muted:#999; --gold:#d4af37; --border:#2a2a2e; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; line-height:1.7; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:820px; margin:0 auto; padding:48px 24px 80px; }
  h1 { font-size:28px; font-weight:700; color:var(--gold); margin-bottom:8px; }
  .updated { color:var(--muted); font-size:13px; margin-bottom:32px; }
  h2 { font-size:18px; font-weight:600; margin-top:32px; margin-bottom:8px; color:#fff; }
  p { margin-bottom:12px; font-size:15px; color:var(--text); }
  ul { margin:8px 0 16px 24px; }
  li { margin-bottom:6px; font-size:15px; }
  a { color:var(--gold); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .brand { text-align:center; padding:24px 0 48px; border-bottom:1px solid var(--border); margin-bottom:32px; }
  .brand-logo { font-size:22px; font-weight:700; color:var(--gold); letter-spacing:1px; }
  .footer { margin-top:48px; padding-top:24px; border-top:1px solid var(--border); text-align:center; color:var(--muted); font-size:13px; }
</style>
</head><body>
<div class="wrap">
  <div class="brand"><div class="brand-logo">DIVINITY WORKS</div></div>
  ${bodyHtml}
  <div class="footer">
    <p>&copy; 2026 Divinity Works. All rights reserved.</p>
    <p>Questions? <a href="mailto:contact@divinityworks.space">contact@divinityworks.space</a></p>
  </div>
</div>
</body></html>`;
}
const LEGAL_HTML = {
    terms: legalShell('Terms of Service', `
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: July 26, 2026</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By creating an account, signing in, or otherwise using Divinity Works ("Divinity," "we," "us," or "our"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not access or use our services.</p>

    <h2>2. Description of Service</h2>
    <p>Divinity Works provides a cloud-based AI assistant platform that enables users to interact with AI models, generate content, manage files, and automate tasks through a web interface and messaging integrations. The service is hosted on our cloud infrastructure and accessible via supported web browsers and connected messaging channels.</p>

    <h2>3. Eligibility</h2>
    <p>You must be at least 16 years of age to use Divinity Works. By using the service, you represent and warrant that you meet this age requirement and that your registration and use of Divinity complies with all applicable laws.</p>

    <h2>4. Account Registration</h2>
    <p>You are responsible for maintaining the security of your account credentials and for all activities that occur under your account. You agree to provide accurate information during registration and to update it as needed. You may not share your account credentials or transfer your account to another person.</p>

    <h2>5. Acceptable Use</h2>
    <p>You agree not to:</p>
    <ul>
      <li>Use Divinity for any unlawful, harmful, fraudulent, or abusive purpose</li>
      <li>Attempt to access, tamper with, or disrupt another user's data, accounts, or sessions</li>
      <li>Reverse-engineer, decompile, or attempt to extract the source code or internal logic of the platform</li>
      <li>Upload, transmit, or store malware, malicious code, or content that infringes intellectual property rights</li>
      <li>Use automated scripts or bots to access the service in a manner that degrades system performance</li>
      <li>Resell, sublicense, or redistribute access to Divinity without written authorization</li>
    </ul>

    <h2>6. AI-Generated Content</h2>
    <p>Divinity generates responses using AI models. AI-generated content may be inaccurate, incomplete, or unsuitable for your needs. You are solely responsible for reviewing, verifying, and acting upon any AI-generated output. Divinity Works does not guarantee the accuracy, reliability, or fitness of AI-generated content for any particular purpose.</p>

    <h2>7. Your Data and Content</h2>
    <p>You retain ownership of all content you upload, create, or generate through Divinity Works. We process and store your data solely to provide and improve the service. Each user's workspace is isolated — your data is not accessible to other users. For details on data handling, see our <a href="/privacy">Privacy Policy</a>.</p>

    <h2>8. Service Availability</h2>
    <p>Divinity Works strives to maintain high availability but does not guarantee uninterrupted access. We may modify, suspend, or discontinue features, integrations, or the service itself at any time without prior notice. We are not liable for downtime, data loss, or service disruptions caused by factors beyond our control.</p>

    <h2>9. Fees and Payment</h2>
    <p>Divinity Works may offer free and paid tiers. If you subscribe to a paid plan, you agree to pay all applicable fees as described at the time of purchase. Fees are non-refundable except as required by law. We may change our pricing at any time with reasonable notice.</p>

    <h2>10. Intellectual Property</h2>
    <p>Divinity Works, including its software, design, branding, and infrastructure, is our intellectual property. These Terms do not grant you any right, title, or interest in our platform except for the limited right to use it in accordance with these Terms.</p>

    <h2>11. Limitation of Liability</h2>
    <p>To the fullest extent permitted by law, Divinity Works and its operators shall not be liable for any indirect, incidental, consequential, or punitive damages, including loss of profits, data, or goodwill, arising from your use of or inability to use the service. Our total liability for any claim shall not exceed the amount you paid us in the preceding twelve (12) months, or zero if no payment was made.</p>

    <h2>12. Indemnification</h2>
    <p>You agree to indemnify and hold Divinity Works harmless from any claims, damages, or expenses arising from your use of the service, your content, or your violation of these Terms.</p>

    <h2>13. Termination</h2>
    <p>You may stop using Divinity and delete your account at any time. We reserve the right to suspend or terminate access immediately, without notice, if we believe you have violated these Terms or if your activity poses a risk to the platform or other users.</p>

    <h2>14. Dispute Resolution</h2>
    <p>Any dispute arising from these Terms or your use of Divinity Works shall be resolved through good-faith negotiation first. If unresolved, disputes shall be submitted to binding arbitration rather than litigated in court. These Terms are governed by applicable law without conflict-of-law principles.</p>

    <h2>15. Changes to Terms</h2>
    <p>We may update these Terms at any time. Material changes will be communicated through the service or by email. Continued use after changes take effect constitutes acceptance of the revised Terms.</p>

    <h2>16. Contact</h2>
    <p>If you have questions about these Terms, contact us at <a href="mailto:contact@divinityworks.space">contact@divinityworks.space</a>.</p>
  `),
    privacy: legalShell('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: July 26, 2026</p>

    <h2>1. Overview</h2>
    <p>Divinity Works ("Divinity," "we," "us") respects your privacy. This Privacy Policy explains what data we collect, how we use it, and the choices you have. We design our systems to minimize data collection and isolate each user's workspace from others.</p>

    <h2>2. Information We Collect</h2>
    <p><strong>Account data:</strong> Your name and email address from your chosen sign-in provider. We do not store your password — authentication is handled by the provider you choose.</p>
    <p><strong>Usage data:</strong> Messages you send to Divinity, AI responses, files you upload, sessions you create, and actions you take within the platform. This data is stored in your isolated per-user workspace.</p>
    <p><strong>Technical data:</strong> IP address, browser type, device identifiers, and session timestamps for security, abuse prevention, and service operation.</p>
    <p><strong>Cookies:</strong> We use essential cookies to maintain your authenticated session. We do not use tracking or advertising cookies.</p>

    <h2>3. How We Use Your Data</h2>
    <ul>
      <li>To provide the AI assistant service, process your requests, and generate responses</li>
      <li>To store your conversations, files, and workspace content so you can access them later</li>
      <li>To authenticate you and keep your session secure</li>
      <li>To monitor service health, prevent abuse, and diagnose technical issues</li>
      <li>To improve the quality and reliability of the platform</li>
    </ul>
    <p>We do not sell your data to third parties. We do not use your content to train AI models.</p>

    <h2>4. Data Sharing</h2>
    <p>Your data is shared only with infrastructure providers that host and process the data needed to run Divinity — for example, the AI model provider that generates your responses, and the cloud infrastructure that stores your data. These providers process data under their own privacy and security commitments. We do not share your data with advertisers, data brokers, or any party beyond what is necessary to operate the service.</p>
    <p>We may disclose data if required by law, court order, or to protect the rights, property, or safety of Divinity Works, our users, or others.</p>

    <h2>5. Data Retention</h2>
    <p>We retain your data for as long as your account is active. If you delete your account or request data deletion, we will remove your personal data from our active systems within 30 days. Residual backups may persist for up to 90 days before permanent deletion. Session and authentication logs are retained for up to 90 days for security purposes.</p>

    <h2>6. Your Rights</h2>
    <p>Depending on your jurisdiction, you may have the right to:</p>
    <ul>
      <li>Access the personal data we hold about you</li>
      <li>Request correction of inaccurate data</li>
      <li>Request deletion of your data and account</li>
      <li>Export your data in a portable format</li>
      <li>Object to or restrict certain processing of your data</li>
      <li>Withdraw consent for data processing at any time</li>
    </ul>
    <p>To exercise any of these rights, contact <a href="mailto:contact@divinityworks.space">contact@divinityworks.space</a>.</p>

    <h2>7. Security</h2>
    <p>We implement industry-standard security measures including encrypted authentication tokens, per-user data isolation, secure session management, and access controls. Data in transit is protected with TLS. However, no system is perfectly secure, and we cannot guarantee absolute security of your data.</p>

    <h2>8. International Users</h2>
    <p>Divinity Works is hosted on cloud infrastructure that may process data in regions different from your own. If you access the service from outside the hosting region, your data may be transferred to and processed in that region. By using Divinity, you consent to such transfers.</p>

    <h2>9. Children's Privacy</h2>
    <p>Divinity Works is not intended for children under 16. We do not knowingly collect data from anyone under 16. If you believe a minor has provided data, contact us and we will delete it promptly.</p>

    <h2>10. Changes to This Policy</h2>
    <p>We may update this Privacy Policy at any time. Material changes will be communicated through the service or by email. Continued use after changes take effect constitutes acceptance of the revised policy.</p>

    <h2>11. Contact</h2>
    <p>Questions about your privacy or this policy? Contact us at <a href="mailto:contact@divinityworks.space">contact@divinityworks.space</a>.</p>
  `)
};
// ── Per-user session manager ──────────────────────────────────────
// Each user gets their own FSSessionRepo + FSTurnRepo pointing to
// ~/.divinity/users/<userId>/storage/{sessions,turns}. This ensures
// User A can never see User B's chats, memory, or runs.
const userSessionsCache = new Map();
const userTurnRepos = new Map();
const userSessionBuses = new Map();
const userTurnEventHubs = new Map();
// Shared services from the DI container (stateless, safe to share)
const sharedClock = container.resolve('clock');
const sharedIdGenerator = container.resolve('idGenerator');
const sharedAgentResolver = container.resolve('agentResolver');
const sharedModelRegistry = container.resolve('modelRegistry');
const sharedToolRegistry = container.resolve('toolRegistry');
const sharedPermissionChecker = container.resolve('permissionChecker');
const sharedPermissionClassifier = container.resolve('permissionClassifier');
const sharedUsageReporter = container.resolve('usageReporter');
function decodeJwt(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
function getUserIdFromToken(token) {
    const payload = decodeJwt(token);
    if (payload?.sub)
        return payload.sub;
    // Fallback: use email or token hash
    if (payload?.email)
        return 'email-' + payload.email.replace(/[^a-zA-Z0-9]/g, '_');
    return 'unknown-user';
}
async function getUserSessions(ws) {
    const token = webTokens.get(ws) || activeToken || '';
    if (!token)
        throw new Error('No auth token');
    const userId = getUserIdFromToken(token);
    if (userSessionsCache.has(userId))
        return userSessionsCache.get(userId);
    // ── Database-backed repos (PostgreSQL) ──────────────────────────
    // Replaces file-based JSONL storage with PostgreSQL. All queries
    // are scoped by user_id with row-level security for defense-in-depth.
    const sessionRepo = new DBSessionRepo({ userId });
    const turnRepo = new DBTurnRepo({ userId });
    userTurnRepos.set(userId, turnRepo);
    // Per-user event buses (in-memory for single-instance, can be swapped
    // for RedisSessionBus when scaling to multiple instances)
    const sessionBus = new EmitterSessionBus();
    const turnEventBus = new TurnEventHub();
    userSessionBuses.set(userId, sessionBus);
    userTurnEventHubs.set(userId, turnEventBus);
    // Per-user turn runtime with per-user turnRepo
    const contextResolver = createContextResolver({ turnRepo: turnRepo });
    const turnRuntime = new TurnRuntime({
        turnRepo: turnRepo,
        idGenerator: sharedIdGenerator,
        clock: sharedClock,
        agentResolver: sharedAgentResolver,
        modelRegistry: sharedModelRegistry,
        toolRegistry: sharedToolRegistry,
        contextResolver,
        permissionChecker: sharedPermissionChecker,
        permissionClassifier: sharedPermissionClassifier,
        lifecycleBus: container.resolve('lifecycleBus'),
        turnEventBus,
        usageReporter: sharedUsageReporter,
    });
    // Per-user sessions service
    const sessions = new SessionsImpl({
        sessionRepo: sessionRepo,
        turnRuntime,
        idGenerator: sharedIdGenerator,
        clock: sharedClock,
        sessionBus,
    });
    // Load existing sessions from database
    await sessions.initialize();
    console.log(`[user:${userId}] Sessions loaded from DB: ${sessions.listSessions().length}`);
    // Subscribe to per-user event buses — forward events only to this user's WS connections
    sessionBus.subscribe((event) => {
        broadcastToUserClients(userId, 'sessions:events', event);
    });
    turnEventBus.subscribeAll((event) => {
        if (isDurableTurnEvent(event.event)) {
            broadcastToUserClients(userId, 'turns:events', event);
        }
    });
    userSessionsCache.set(userId, sessions);
    return sessions;
}
// Map of userId → Set<WebSocket> for per-user event broadcasting
const userClients = new Map();
// Map of WebSocket → userId (for cleanup on disconnect)
const wsToUserId = new Map();
function registerUserClient(userId, ws) {
    if (!userClients.has(userId))
        userClients.set(userId, new Set());
    userClients.get(userId).add(ws);
    wsToUserId.set(ws, userId);
}
function unregisterUserClient(ws) {
    const userId = wsToUserId.get(ws);
    if (userId) {
        userClients.get(userId)?.delete(ws);
        wsToUserId.delete(ws);
    }
}
function broadcastToUserClients(userId, channel, payload) {
    const clients = userClients.get(userId);
    if (!clients || clients.size === 0)
        return;
    const message = JSON.stringify({
        type: 'event',
        channel,
        data: payload,
    });
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            }
            catch (e) {
                console.error(`Error broadcasting to user client: ${e}`);
            }
        }
    }
}
// ── Per-user runs repo proxy ──────────────────────────────────────
// The legacy runs system (runsCore.createRun, runs:fetch, etc.) resolves
// `runsRepo` from the DI container. We register a proxy that delegates to
// per-user FSRunsRepo instances based on the active token, so each user's
// legacy runs are stored in ~/.divinity/users/<userId>/storage/runs/.
import { FSRunsRepo } from '@x/core/dist/runtime/legacy/repo.js';
const userRunsRepos = new Map(); // userId → FSRunsRepo
function getUserRunsRepo() {
    const token = activeToken || '';
    if (!token) {
        // Fallback: use the default global runs dir
        return container.resolve('runsRepo');
    }
    const userId = getUserIdFromToken(token);
    if (userRunsRepos.has(userId))
        return userRunsRepos.get(userId);
    const userDir = path.join(WorkDir, 'users', userId);
    const runsDir = path.join(userDir, 'storage', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    const repo = new FSRunsRepo({ idGenerator: sharedIdGenerator, runsDir });
    userRunsRepos.set(userId, repo);
    return repo;
}
// Proxy that delegates to per-user FSRunsRepo based on activeToken
const runsRepoProxy = {
    create: (opts) => getUserRunsRepo().create(opts),
    fetch: (id) => getUserRunsRepo().fetch(id),
    list: (cursor) => getUserRunsRepo().list(cursor),
    listByWorkDir: (dir) => getUserRunsRepo().listByWorkDir(dir),
    appendEvents: (runId, events) => getUserRunsRepo().appendEvents(runId, events),
    delete: (id) => getUserRunsRepo().delete(id),
};
// Override the container's runsRepo with our per-user proxy
container.register({
    runsRepo: asValue(runsRepoProxy),
});
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
const webTokens = new Map();
let activeToken = null; // most recently seen token
// WebOAuthRepo — replaces FSOAuthRepo. Returns JWT from WebSocket
// connection instead of reading oauth.json from disk.
class WebOAuthRepo {
    async read(provider) {
        if (provider === 'rowboat' && activeToken) {
            // Decode JWT to get expiry
            let expiresAt = Math.floor(Date.now() / 1000) + 3600;
            try {
                const payload = JSON.parse(Buffer.from(activeToken.split('.')[1], 'base64url').toString('utf8'));
                expiresAt = payload.exp ?? expiresAt;
            }
            catch { }
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
    async upsert() { }
    async delete() { }
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
// ── CDP Browser Control Service ──────────────────────────────────────
// Cloud browser: real Chromium on VM + CDP for AI control + screencast
// streaming to web client. Replaces ElectronBrowserControlService.
const cdpBrowser = new CDPBrowserControlService({
    chromiumPath: process.env.CHROMIUM_PATH || 'chromium-browser',
    port: parseInt(process.env.CDP_PORT || '9222', 10),
    windowWidth: 1280,
    windowHeight: 800,
});
container.register({
    browserControlService: asValue(cdpBrowser),
});
console.log('[CDP] Browser control service registered');
// Handle browser streaming + input messages (not regular IPC invoke)
// These come through as special message types alongside 'invoke'/'subscribe'
// Stub implementations for functions that live in main/ local files (not in @x/core).
// These are Electron-dependent; the web-bridge stubs them out.
// Note: 'rowboat' provider is handled separately above (JWT-based).
async function connectProvider(_provider, _credentials) {
    return { error: 'not_implemented' };
}
async function disconnectProvider(_provider) {
    return { error: 'not_implemented' };
}
function listProviders() {
    return [];
}
async function startManagedGooglePick(_targetFolder) {
    // Start the CDP browser (launches Chromium + creates initial Google.com tab)
    // This function is known to be preserved in tsc output
    cdpBrowser.start().then(() => {
        console.log('[CDP] Browser started successfully — initial tab at Google.com');
        broadcastToClients('browser:didUpdateState', cdpBrowser.getBrowserState());
    }).catch((err) => {
        console.error('[CDP] Failed to start browser:', err);
    });
    return { error: 'not_implemented' };
}
function consumePendingDeepLink() {
    return null;
}
// Local helper functions defined in ipc.ts (not exported from @x/core).
// Copied here so the Slack handlers work without modification.
function parseWhoamiWorkspaces(data) {
    const parsed = (data ?? {});
    return (parsed.workspaces || []).map((w) => ({
        url: w.workspace_url || '',
        name: w.workspace_name || '',
    }));
}
function extractArrayPayload(parsed) {
    if (Array.isArray(parsed))
        return parsed;
    if (parsed && typeof parsed === 'object') {
        const obj = parsed;
        for (const key of ['messages', 'channels', 'items', 'results', 'data']) {
            if (Array.isArray(obj[key]))
                return obj[key];
        }
    }
    return [];
}
function slackMessageText(message) {
    const value = message.text ?? message.body ?? message.content;
    return typeof value === 'string' ? value.trim() : '';
}
function slackMessageAuthor(message) {
    const value = message.username ?? message.user ?? message.author;
    return typeof value === 'string' ? value : undefined;
}
function extractSlackUserName(raw) {
    if (!raw || typeof raw !== 'object')
        return null;
    const obj = raw;
    const profile = obj.profile && typeof obj.profile === 'object' ? obj.profile : undefined;
    const user = obj.user && typeof obj.user === 'object' ? obj.user : undefined;
    const userProfile = user?.profile && typeof user.profile === 'object' ? user.profile : undefined;
    const candidates = [
        profile?.display_name, profile?.real_name,
        userProfile?.display_name, userProfile?.real_name,
        obj.display_name, obj.displayName, obj.real_name, obj.realName,
        user?.display_name, user?.displayName, user?.real_name, user?.realName,
        obj.name, user?.name,
    ];
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim())
            return candidate.trim();
    }
    return null;
}
async function resolveSlackUserName(userId, workspaceUrl, cache) {
    const key = `${workspaceUrl ?? ''}:${userId}`;
    if (cache.has(key))
        return cache.get(key) ?? null;
    const args = ['user', 'get', userId];
    if (workspaceUrl)
        args.push('--workspace', workspaceUrl);
    const result = await runAgentSlack(args, { timeoutMs: 10000, maxBuffer: 512 * 1024 });
    if (result.ok) {
        const name = extractSlackUserName(result.data ?? {});
        if (name) {
            cache.set(key, name);
            return name;
        }
    }
    else {
        console.warn(`[Slack] Failed to resolve user ${userId}: ${result.message}`);
    }
    cache.set(key, userId);
    return null;
}
async function resolveSlackMessageText(text, workspaceUrl, cache) {
    const matches = Array.from(text.matchAll(/<@([UW][A-Z0-9]+)(?:\|([^>]+))?>|@([UW][A-Z0-9]{6,})\b/g));
    if (matches.length === 0)
        return text;
    let resolved = text;
    for (const match of matches) {
        const userId = match[1] ?? match[3];
        if (!userId)
            continue;
        const fallback = match[2] ?? match[0];
        const name = await resolveSlackUserName(userId, workspaceUrl, cache);
        resolved = resolved.replaceAll(match[0], name ?? fallback);
    }
    return resolved;
}
async function resolveSlackAuthor(author, workspaceUrl, cache) {
    if (!author)
        return undefined;
    if (!/^[UW][A-Z0-9]{6,}$/.test(author))
        return author;
    return await resolveSlackUserName(author, workspaceUrl, cache) ?? author;
}
function slackMessageUrl(message, workspaceUrl, channelId, ts) {
    const direct = message.permalink ?? message.url;
    if (typeof direct === 'string' && direct)
        return direct;
    if (!workspaceUrl || !channelId)
        return undefined;
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
        openExternal: async () => { },
        showItemInFolder: async () => { },
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
        stop: () => { },
        isStarted: () => false,
    },
    autoUpdater: {
        checkForUpdates: async () => { },
        quitAndInstall: () => { },
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
const MIME_TYPES = {
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
    '.pdf': 'application/pdf',
    '.html': 'text/html; charset=utf-8',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
};
// ── Server-side auth gate ──────────────────────────────────────────
// Full HS256 JWT signature verification using Node's crypto module.
// The JWT_SECRET is shared with the Cloudflare Worker that issues tokens.
const JWT_SECRET = process.env.JWT_SECRET || '';
function isTokenValid(token) {
    if (!JWT_SECRET) {
        // Fallback: if no secret configured, only check expiry (dev mode)
        try {
            const parts = token.split('.');
            if (parts.length < 2)
                return false;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            if (payload.exp && Date.now() >= payload.exp * 1000)
                return false;
            return true;
        }
        catch {
            return false;
        }
    }
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return false;
        const [headerB64, payloadB64, sigB64] = parts;
        const signingInput = `${headerB64}.${payloadB64}`;
        const sig = Buffer.from(sigB64, 'base64url');
        const expectedSig = createHmac('sha256', JWT_SECRET).update(signingInput).digest();
        if (sig.length !== expectedSig.length)
            return false;
        if (!timingSafeEqual(sig, expectedSig))
            return false;
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp && Date.now() >= payload.exp * 1000)
            return false;
        if (payload.type && payload.type !== 'access')
            return false;
        return true;
    }
    catch {
        return false;
    }
}
// Decode JWT payload (without verification — used for extracting user info)
function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    }
    catch {
        return null;
    }
}
// HTML served to unauthenticated visitors — matches dashboard sign-in page branding
const SIGN_IN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#ffffff" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
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
        const health = {
            status: 'ok',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            memory: { rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB' },
            services: {}
        };
        // Check PostgreSQL
        try {
            const pool = getDbPool();
            const client = await pool.connect();
            const result = await client.query('SELECT COUNT(*) as session_count FROM sessions');
            health.services.postgres = `ok (${result.rows[0].session_count} sessions)`;
            client.release();
        }
        catch (e) {
            health.services.postgres = `error: ${e.message}`;
            health.status = 'degraded';
        }
        // Check Redis
        try {
            const redis = getRedisCache();
            const pong = await redis.ping();
            health.services.redis = `ok (${pong})`;
        }
        catch (e) {
            health.services.redis = `error: ${e.message}`;
            health.status = 'degraded';
        }
        res.writeHead(health.status === 'ok' ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(health));
        return;
    }
    // Metrics endpoint — basic stats
    if (req.url === '/metrics') {
        const metrics = {
            timestamp: new Date().toISOString(),
            uptime_seconds: Math.round(process.uptime()),
            connected_clients: clients.size,
            memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            active_users: webTokens.size
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metrics));
        return;
    }
    // ── LEGAL PAGES ──────────────────────────────────────────────────
    // Public, no auth required. Served as standalone HTML.
    const reqPath = (req.url || '/').split('?')[0];
    if (reqPath === '/terms' || reqPath === '/privacy') {
        const isTerms = reqPath === '/terms';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(isTerms ? LEGAL_HTML.terms : LEGAL_HTML.privacy);
        return;
    }
    // ── Deepgram STT WebSocket: skip auth, let ws library handle upgrade ──
    // WebSocket upgrade requests must not get an HTTP response body — the
    // ws library handles them via the 'upgrade' event on the HTTP server.
    if ((req.headers.upgrade || '').includes('websocket')) {
        const wsPath = (req.url || '/').split('?')[0];
        if (wsPath.startsWith('/deepgram/')) {
            return; // do not send a response — ws WebSocketServer will handle the upgrade
        }
    }
    // ── AUTH GATE ───────────────────────────────────────────────────
    // Every request must pass auth. No token = redirect to sign-in page.
    // Token in URL is consumed by web-preload.ts (saved to localStorage,
    // URL cleaned). Subsequent requests use cookie.
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const urlToken = url.searchParams.get('token') || url.searchParams.get('access_token');
    const urlRefresh = url.searchParams.get('refresh_token');
    const cookieToken = (req.headers['cookie'] || '').match(/dw_access_token=([^;]+)/)?.[1];
    const cookieRefresh = (req.headers['cookie'] || '').match(/dw_refresh_token=([^;]+)/)?.[1];
    const bearerToken = (req.headers['authorization'] || '').match(/^Bearer\s+(.+)$/i)?.[1];
    let token = urlToken || cookieToken || bearerToken || null;
    let refreshToken = urlRefresh || cookieRefresh || null;
    // ── Token refresh: if access token is missing or expired but we have
    // a refresh token, silently get a new access token from the SaaS Worker.
    // This is the key to long-lived browser sessions: the access JWT expires,
    // but the refresh token (30-day cookie) lets us silently renew without
    // bouncing the user to the sign-in page. ──
    if ((!token || !isTokenValid(token)) && refreshToken) {
        try {
            const refreshRes = await fetch('https://dash.divinityworks.space/auth/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken }),
            });
            if (refreshRes.ok) {
                const tokens = await refreshRes.json();
                if (tokens.access_token) {
                    token = tokens.access_token;
                    // Update refresh token if rotated
                    if (tokens.refresh_token)
                        refreshToken = tokens.refresh_token;
                    // Set updated cookies — long Max-Age so the browser keeps them
                    const cookies = [
                        `dw_access_token=${tokens.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
                        `dw_refresh_token=${refreshToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
                    ];
                    res.setHeader('Set-Cookie', cookies);
                    console.log('Token refreshed successfully');
                }
            }
            else {
                console.log(`Token refresh failed: ${refreshRes.status} ${refreshRes.statusText}`);
            }
        }
        catch (refreshErr) {
            console.error('Token refresh failed:', refreshErr);
        }
    }
    if (!token || !isTokenValid(token)) {
        const reqPath = (req.url || '/').split('?')[0];
        const ext = extname(reqPath).toLowerCase();
        // HTML page request → redirect to the ONE sign-in page
        if (reqPath === '/' || ext === '.html' || ext === '') {
            res.writeHead(302, { 'Location': 'https://dash.divinityworks.space/signin' });
            res.end();
            return;
        }
        // For assets (JS/CSS/fonts) without auth — 401
        res.writeHead(401, { 'Content-Type': 'text/plain' });
        res.end('Unauthorized');
        return;
    }
    // ── AUTHENTICATED — serve files ─────────────────────────────────
    // If token came from URL, set cookies so subsequent asset requests
    // (JS, CSS, fonts) are automatically authenticated.
    if (urlToken) {
        const cookies = [
            `dw_access_token=${urlToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
        ];
        if (urlRefresh) {
            cookies.push(`dw_refresh_token=${urlRefresh}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
        }
        res.setHeader('Set-Cookie', cookies);
    }
    let urlPath = req.url?.split('?')[0] || '/';
    if (urlPath === '/')
        urlPath = '/web.html';
    // ── File download endpoint ──────────────────────────────────────
    // Serves AI-created files (PDFs, images, slides, docs, etc.) from the
    // user's workspace to the browser. Files may be in the per-user
    // workspace directory OR in the root WorkDir (some AI tools write
    // there directly). Checks per-user dir first, then root as fallback.
    if (urlPath.startsWith('/files/')) {
        const userId = getUserIdFromToken(token);
        const userWorkDir = path.join(WorkDir, 'users', userId);
        // Strip /files/ prefix and resolve relative to user workspace
        const relativePath = urlPath.slice('/files/'.length);
        // Security: prevent path traversal
        let resolvedPath = path.resolve(userWorkDir, relativePath);
        // If not found in per-user dir, try root WorkDir (AI may write there)
        try {
            await stat(resolvedPath);
        }
        catch {
            resolvedPath = path.resolve(WorkDir, relativePath);
        }
        // Final security check: path must be inside WorkDir
        if (!resolvedPath.startsWith(WorkDir)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden: path outside workspace');
            return;
        }
        try {
            const fileStat = await stat(resolvedPath);
            if (!fileStat.isFile()) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not found');
                return;
            }
            const ext = extname(resolvedPath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const data = await readFile(resolvedPath);
            // For PDFs, images, text: inline (preview in browser)
            // For unknown/binary: attachment (download)
            const inlineTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
                '.txt', '.md', '.json', '.csv', '.html', '.js', '.css', '.mp4', '.webm', '.mp3', '.wav'];
            const disposition = inlineTypes.includes(ext) ? 'inline' : 'attachment';
            const filename = path.basename(resolvedPath);
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Disposition': `${disposition}; filename="${filename}"`,
                'Content-Length': fileStat.size,
                'Cache-Control': 'no-cache',
            });
            res.end(data);
            return;
        }
        catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
            return;
        }
    }
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
    }
    catch (e) {
        // File not found — fall through to SPA fallback
    }
    // SPA fallback: serve web.html for unknown routes
    try {
        const fallbackPath = join(RENDERER_DIST, 'web.html');
        const data = await readFile(fallbackPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
    }
    catch (e) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
    }
});
const wss = new WebSocketServer({ noServer: true });
const deepgramSttWss = new WebSocketServer({ noServer: true });
// ── Single upgrade handler for both WebSocketServers ────────────
// When two WebSocketServer instances both attach to the same httpServer
// via { server }, only the first one's upgrade listener fires. Using
// noServer mode with a single manual upgrade handler fixes this.
httpServer.on('upgrade', (req, socket, head) => {
    const wsPath = (req.url || '/').split('?')[0];
    if (wsPath.startsWith('/deepgram/')) {
        deepgramSttWss.handleUpgrade(req, socket, head, (ws) => {
            deepgramSttWss.emit('connection', ws, req);
        });
    }
    else {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    }
});
deepgramSttWss.on('connection', async (clientWs, req) => {
    let deepgramApiKey = '';
    try {
        const configPath = resolve(WorkDir, 'config', 'deepgram.json');
        const raw = readFileSync(configPath, 'utf8');
        deepgramApiKey = JSON.parse(raw)?.apiKey || '';
    }
    catch {
        console.error('[deepgram-proxy] No deepgram.json found');
        clientWs.close(1011, 'Deepgram not configured');
        return;
    }
    if (!deepgramApiKey) {
        clientWs.close(1011, 'Deepgram API key missing');
        return;
    }
    // Forward query params from the incoming request to Deepgram
    const dgUrl = `wss://api.deepgram.com/v1/listen${req.url?.replace(/^\/deepgram\/v1\/listen/, '') || ''}`;
    let dgWs;
    try {
        // Use the ws library's WebSocket explicitly (the global WebSocket in Node 22
        // has different behaviour and doesn't support subprotocols the same way)
        dgWs = new WebSocket(dgUrl, ['token', deepgramApiKey]);
        console.log('[deepgram-proxy] Connecting to Deepgram:', dgUrl.substring(0, 80));
    }
    catch (err) {
        console.error('[deepgram-proxy] Constructor error:', err?.message, err?.stack);
        clientWs.close(1011, 'Failed to connect to Deepgram');
        return;
    }
    let dgReady = false;
    const pendingMessages = [];
    // Deepgram → browser: forward transcript results
    dgWs.on('open', () => {
        dgReady = true;
        console.log('[deepgram-proxy] Deepgram connected');
        for (const msg of pendingMessages) {
            dgWs.send(msg);
        }
        pendingMessages.length = 0;
    });
    dgWs.on('message', (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
        }
    });
    dgWs.on('error', (err) => {
        console.error('[deepgram-proxy] Upstream error:', err?.message, err?.stack);
        try {
            clientWs.close(1011, 'Deepgram connection error');
        }
        catch { }
    });
    dgWs.on('close', (code, reason) => {
        console.log('[deepgram-proxy] Deepgram closed:', code, reason.toString());
        try {
            clientWs.close(1000, 'Deepgram closed');
        }
        catch { }
    });
    // Browser → Deepgram: forward mic audio
    clientWs.on('message', (data) => {
        if (dgReady && dgWs.readyState === WebSocket.OPEN) {
            dgWs.send(data);
        }
        else if (!dgReady) {
            pendingMessages.push(data);
        }
    });
    clientWs.on('close', () => {
        try {
            dgWs.close();
        }
        catch { }
    });
    clientWs.on('error', () => {
        try {
            dgWs.close();
        }
        catch { }
    });
});
// ── Load existing sessions from disk on startup ───────────────────
// The SessionIndex is an in-memory Map that starts empty. Without
// calling initialize(), sessions:list returns [] even though session
// files exist on disk — making it look like data was "wiped" after a
// server restart or browser refresh.
httpServer.listen(8790, async () => {
    console.log('Divinity web bridge listening on http://localhost:8790');
    console.log('  Static files: ' + RENDERER_DIST);
    console.log('  WebSocket: ws://localhost:8790/ws');
    // Start the Divinity Apps server (port 0 — auto-assigned) so that
    // apps:list and apps:serverStatus report it as running instead of
    // "Apps server is not running."
    try {
        await appsServer.init();
        console.log('  Apps server initialized.');
    }
    catch (e) {
        console.error('  Apps server failed to start:', e);
    }
    // Rebuild the in-memory session index from disk files
    // Per-user sessions are now initialized lazily on first WS connection
    // via getUserSessions(ws). No global initialization needed here.
    console.log('  Per-user sessions will be loaded lazily on first connection.');
    // Ensure browser_sessions table exists for cookie persistence
    try {
        await BrowserSessionRepo.ensureSchema();
    }
    catch (e) {
        console.error('  Browser sessions table init failed:', e);
    }
});
// Store connected clients and subscriptions
const clients = new Set();
const subscriptions = new Map(); // channel -> Set<WebSocket>
// Broadcast to all connected clients
function broadcastToClients(channel, payload) {
    const message = JSON.stringify({
        type: 'event',
        channel,
        data: payload,
    });
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            }
            catch (error) {
                console.error(`Error broadcasting to client: ${error}`);
            }
        }
    }
}
// Broadcast to subscribed clients only
function broadcastToSubscribers(channel, payload) {
    const subscribers = subscriptions.get(channel);
    if (!subscribers || subscribers.size === 0)
        return;
    const message = JSON.stringify({
        type: 'event',
        channel,
        data: payload,
    });
    for (const client of subscribers) {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            }
            catch (error) {
                console.error(`Error broadcasting to subscriber: ${error}`);
            }
        }
    }
}
// Subscribe a client to a channel
function subscribeClient(client, channel) {
    if (!subscriptions.has(channel)) {
        subscriptions.set(channel, new Set());
    }
    subscriptions.get(channel).add(client);
}
// Unsubscribe a client from a channel
function unsubscribeClient(client, channel) {
    const subscribers = subscriptions.get(channel);
    if (subscribers) {
        subscribers.delete(client);
        if (subscribers.size === 0) {
            subscriptions.delete(channel);
        }
    }
}
/** Sync all Composio connections for a user from the API to the local repo.
 *  Called on WebSocket connect to ensure the AI runtime sees existing connections. */
async function syncUserComposioConnections(userId) {
    if (!COMPOSIO_API_KEY)
        return;
    try {
        const res = await fetch(`${COMPOSIO_BASE}/connected_accounts?user_id=${encodeURIComponent(userId)}`, {
            headers: composioHeaders(),
        });
        if (!res.ok)
            return;
        const data = await res.json();
        const activeAccounts = (data.items || []).filter((a) => a.status === 'ACTIVE' || a.connection_status === 'ACTIVE');
        let changed = false;
        for (const a of activeAccounts) {
            const slug = a.toolkit_slug || a.toolkit?.slug || a.slug;
            if (slug) {
                composioAccountsRepo.saveAccount({
                    id: a.id,
                    authConfigId: a.auth_config?.id || '',
                    status: 'ACTIVE',
                    toolkitSlug: slug,
                    createdAt: a.created_at || new Date().toISOString(),
                    lastUpdatedAt: new Date().toISOString(),
                });
                changed = true;
            }
        }
        if (changed) {
            invalidateCopilotInstructionsCache();
            console.log(`[composio] Synced ${activeAccounts.length} active connections for user ${userId}`);
        }
    }
    catch (err) {
        console.error('[composio] syncUserConnections error:', err);
    }
}
// Handle incoming WebSocket messages
// Extract auth token from WebSocket subprotocol (passed by web-preload shim)
const clientAuthTokens = new Map();
wss.on('connection', (ws, req) => {
    // Read auth token from subprotocol: ['bearer', '<token>']
    let authToken = '';
    if (req.headers['sec-websocket-protocol']) {
        const protocols = req.headers['sec-websocket-protocol'].split(',').map((s) => s.trim());
        if (protocols[0] === 'bearer' && protocols[1]) {
            authToken = protocols[1];
        }
    }
    if (authToken) {
        clientAuthTokens.set(ws, authToken);
        webTokens.set(ws, authToken);
        activeToken = authToken; // set as active for non-request-scoped calls
        // Register this WS connection with its user ID for per-user event broadcasting
        const userId = getUserIdFromToken(authToken);
        registerUserClient(userId, ws);
        console.log('New client connected', authToken ? `(authenticated, user: ${userId})` : '(anonymous)');
        // Sync Composio connections for this user on connect — ensures the AI
        // runtime discovers any connections that were created via the web UI
        // (including from a previous session or a different device).
        if (COMPOSIO_API_KEY) {
            syncUserComposioConnections(userId).catch(err => console.error('[composio] startup sync error:', err));
        }
    }
    clients.add(ws);
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            // Set active token for this request's scope so @x/core functions
            // (getAccessToken, isSignedIn, getBillingInfo, etc.) can use it
            const wsToken = webTokens.get(ws);
            if (wsToken)
                activeToken = wsToken;
            // ── Per-user workspace isolation ──────────────────────────
            // Wrap the entire message handler in AsyncLocalStorage so that
            // workspace.getWorkDir() resolves to the user's directory.
            const _userId = wsToken ? getUserIdFromToken(wsToken) : null;
            const _userDir = _userId ? path.join(WorkDir, 'users', _userId) : null;
            if (_userDir) {
                // Ensure per-user workspace directories exist
                fs.mkdirSync(path.join(_userDir, 'knowledge'), { recursive: true });
                fs.mkdirSync(path.join(_userDir, 'agents'), { recursive: true });
                fs.mkdirSync(path.join(_userDir, 'skills'), { recursive: true });
                fs.mkdirSync(path.join(_userDir, 'bases'), { recursive: true });
                fs.mkdirSync(path.join(_userDir, 'config'), { recursive: true });
                fs.mkdirSync(path.join(_userDir, 'storage', 'runs'), { recursive: true });
            }
            const dispatch = () => {
                if (message.type === 'invoke') {
                    handleInvoke(ws, message);
                }
                else if (message.type === 'subscribe') {
                    subscribeClient(ws, message.channel);
                    ws.send(JSON.stringify({
                        type: 'response',
                        reqId: message.reqId,
                        result: { success: true }
                    }));
                }
                else if (message.type === 'unsubscribe') {
                    unsubscribeClient(ws, message.channel);
                    ws.send(JSON.stringify({
                        type: 'response',
                        reqId: message.reqId,
                        result: { success: true }
                    }));
                }
                else if (message.type === 'browser:screencast:start') {
                    // Start streaming browser frames to this client
                    cdpBrowser.addScreencastClient(ws);
                    ws.send(JSON.stringify({
                        type: 'response',
                        reqId: message.reqId,
                        result: { success: true }
                    }));
                }
                else if (message.type === 'browser:screencast:stop') {
                    cdpBrowser.removeScreencastClient(ws);
                    ws.send(JSON.stringify({
                        type: 'response',
                        reqId: message.reqId,
                        result: { success: true }
                    }));
                }
                else if (message.type === 'browser:input') {
                    // Forward mouse/keyboard input from user to the browser via CDP
                    cdpBrowser.handleInputEvent(ws, message.input).catch(err => {
                        console.error('[CDP] Input error:', err);
                    });
                }
            };
            if (_userDir) {
                userWorkDirStorage.run(_userDir, dispatch);
            }
            else {
                dispatch();
            }
        }
        catch (error) {
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
        unregisterUserClient(ws); // remove from per-user event broadcast list
        cdpBrowser.removeScreencastClient(ws); // stop streaming browser frames to this client
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
// ── Composio API helpers ──────────────────────────────────────────────────
// All Composio calls use the server-side COMPOSIO_API_KEY.
// Users are identified by their Divinity user_id (passed as Composio user_id).
const COMPOSIO_BASE = process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev/api/v3';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY || '';
const COMPOSIO_CALLBACK_URL = 'https://dash.divinityworks.space/api/composio/callback';
function composioHeaders() {
    return {
        'Authorization': `Bearer ${COMPOSIO_API_KEY}`,
        'Content-Type': 'application/json',
    };
}
const activeComposioFlows = new Map();
/** Initiate a Composio OAuth connection for any toolkit (Gmail, Calendar, GitHub, etc.) */
async function initiateComposioConnection(toolkitSlug, userId) {
    if (!COMPOSIO_API_KEY) {
        return { success: false, error: 'Connect service is not configured.' };
    }
    try {
        const slug = toolkitSlug.toLowerCase();
        const flowKey = `${userId}:${slug}`;
        // Abort existing flow
        const existing = activeComposioFlows.get(flowKey);
        if (existing && existing.timeout)
            clearTimeout(existing.timeout);
        activeComposioFlows.delete(flowKey);
        // Step 1: Get the toolkit to check it supports managed OAuth2
        const toolkitRes = await fetch(`${COMPOSIO_BASE}/toolkits/${slug}`, {
            headers: composioHeaders(),
        });
        if (!toolkitRes.ok) {
            return { success: false, error: `Could not find service "${slug}".` };
        }
        const toolkit = await toolkitRes.json();
        const schemes = toolkit.composio_managed_auth_schemes || [];
        if (!schemes.includes('OAUTH2')) {
            return { success: false, error: `"${slug}" does not support managed OAuth2.` };
        }
        // Step 2: Find or create a managed OAuth2 auth config
        const listRes = await fetch(`${COMPOSIO_BASE}/auth_configs?toolkit_slug=${encodeURIComponent(slug)}&is_composio_managed=true`, {
            headers: composioHeaders(),
        });
        let authConfigId = null;
        if (listRes.ok) {
            const listData = await listRes.json();
            const managed = (listData.items || []).find((c) => c.auth_scheme === 'OAUTH2' && c.is_composio_managed);
            if (managed)
                authConfigId = managed.id;
        }
        if (!authConfigId) {
            const createRes = await fetch(`${COMPOSIO_BASE}/auth_configs`, {
                method: 'POST',
                headers: composioHeaders(),
                body: JSON.stringify({
                    toolkit: { slug },
                    auth_config: { type: 'use_composio_managed_auth', name: `divinityworks-${slug}` },
                }),
            });
            if (!createRes.ok) {
                return { success: false, error: 'Failed to set up the connection. Please try again.' };
            }
            const created = await createRes.json();
            authConfigId = created.auth_config?.id;
        }
        // Step 3: Create connected account via /connected_accounts/link (new v3 endpoint)
        const linkRes = await fetch(`${COMPOSIO_BASE}/connected_accounts/link`, {
            method: 'POST',
            headers: composioHeaders(),
            body: JSON.stringify({
                auth_config_id: authConfigId,
                user_id: userId,
                callback_url: COMPOSIO_CALLBACK_URL,
            }),
        });
        if (!linkRes.ok) {
            const errBody = await linkRes.text();
            console.error('[composio] linkAccount error:', linkRes.status, errBody);
            return { success: false, error: 'Failed to start the connection process.' };
        }
        const linkData = await linkRes.json();
        const redirectUrl = linkData.redirect_url;
        const connectedAccountId = linkData.connected_account_id;
        if (!redirectUrl) {
            return { success: false, error: 'No authorization URL was provided.' };
        }
        // Track the flow
        activeComposioFlows.set(flowKey, {
            connectedAccountId,
            authConfigId,
            toolkitSlug: slug,
            userId,
            startedAt: Date.now(),
            timeout: setTimeout(() => activeComposioFlows.delete(flowKey), 5 * 60 * 1000),
        });
        return { success: true, redirectUrl, connectedAccountId };
    }
    catch (err) {
        console.error('[composio] initiateConnection error:', err);
        return { success: false, error: 'Something went wrong starting the connection.' };
    }
}
/** Check if a toolkit is connected for this user */
async function getComposioConnectionStatus(toolkitSlug, userId) {
    if (!COMPOSIO_API_KEY) {
        return { success: false, connected: false };
    }
    try {
        // Check local repo first — if already ACTIVE, no need to poll Composio
        if (composioAccountsRepo.isConnected(toolkitSlug)) {
            return { success: true, isConnected: true, status: 'ACTIVE' };
        }
        // Check in-memory flow for in-progress OAuth
        const flowKey = `${userId}:${toolkitSlug}`;
        const flow = activeComposioFlows.get(flowKey);
        if (!flow) {
            // No in-memory flow — check Composio API directly for this user+toolkit
            const listRes = await fetch(`${COMPOSIO_BASE}/connected_accounts?user_id=${encodeURIComponent(userId)}&toolkit_slug=${encodeURIComponent(toolkitSlug)}`, {
                headers: composioHeaders(),
            });
            if (listRes.ok) {
                const listData = await listRes.json();
                const active = (listData.items || []).find((a) => (a.status === 'ACTIVE' || a.connection_status === 'ACTIVE') &&
                    (a.toolkit_slug === toolkitSlug || a.toolkit?.slug === toolkitSlug));
                if (active) {
                    // Persist to local repo so the AI runtime can discover it
                    composioAccountsRepo.saveAccount({
                        id: active.id,
                        authConfigId: active.auth_config?.id || '',
                        status: 'ACTIVE',
                        toolkitSlug,
                        createdAt: active.created_at || new Date().toISOString(),
                        lastUpdatedAt: new Date().toISOString(),
                    });
                    invalidateCopilotInstructionsCache();
                    return { success: true, isConnected: true, status: 'ACTIVE' };
                }
            }
            return { success: true, isConnected: false };
        }
        // Check the account status from Composio
        const res = await fetch(`${COMPOSIO_BASE}/connected_accounts/${flow.connectedAccountId}`, {
            headers: composioHeaders(),
        });
        if (!res.ok) {
            return { success: true, isConnected: false };
        }
        const account = await res.json();
        const status = account.status || account.connection_status;
        if (status === 'ACTIVE') {
            activeComposioFlows.delete(flowKey);
            // Persist to local repo so the AI runtime discovers it
            composioAccountsRepo.saveAccount({
                id: flow.connectedAccountId,
                authConfigId: flow.authConfigId,
                status: 'ACTIVE',
                toolkitSlug,
                createdAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
            });
            invalidateCopilotInstructionsCache();
            return { success: true, isConnected: true, status: 'ACTIVE' };
        }
        if (status === 'FAILED' || status === 'EXPIRED') {
            activeComposioFlows.delete(flowKey);
            return { success: true, isConnected: false, status, error: 'Connection was not completed.' };
        }
        return { success: true, isConnected: false, status: status || 'PENDING' };
    }
    catch (err) {
        console.error('[composio] getConnectionStatus error:', err);
        return { success: false, connected: false, error: 'Failed to check connection status.' };
    }
}
/** Force a sync of the connection status (used after OAuth callback) */
async function syncComposioConnection(connectedAccountId, toolkitSlug, userId) {
    if (!COMPOSIO_API_KEY) {
        return { success: false, error: 'Connect service is not configured.' };
    }
    try {
        const res = await fetch(`${COMPOSIO_BASE}/connected_accounts/${connectedAccountId}`, {
            headers: composioHeaders(),
        });
        if (!res.ok) {
            return { success: false, error: 'Failed to check connection.' };
        }
        const account = await res.json();
        const status = account.status || account.connection_status;
        if (status === 'ACTIVE') {
            const flowKey = `${userId}:${toolkitSlug}`;
            activeComposioFlows.delete(flowKey);
            // Persist to local repo so the AI runtime discovers it
            composioAccountsRepo.saveAccount({
                id: connectedAccountId,
                authConfigId: account.auth_config?.id || '',
                status: 'ACTIVE',
                toolkitSlug,
                createdAt: account.created_at || new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
            });
            invalidateCopilotInstructionsCache();
            return { success: true, isConnected: true, status: 'ACTIVE' };
        }
        return { success: true, isConnected: false, status };
    }
    catch (err) {
        console.error('[composio] syncConnection error:', err);
        return { success: false, error: 'Failed to sync connection.' };
    }
}
/** List all connected accounts for a user — merges local repo with Composio API */
async function listConnectedComposio(userId) {
    if (!COMPOSIO_API_KEY) {
        // Fall back to local repo only
        const localToolkits = composioAccountsRepo.getConnectedToolkits();
        return { toolkits: localToolkits.map(slug => ({ slug, status: 'ACTIVE' })) };
    }
    try {
        const res = await fetch(`${COMPOSIO_BASE}/connected_accounts?user_id=${encodeURIComponent(userId)}`, {
            headers: composioHeaders(),
        });
        if (!res.ok) {
            // Fall back to local repo
            const localToolkits = composioAccountsRepo.getConnectedToolkits();
            return { toolkits: localToolkits.map(slug => ({ slug, status: 'ACTIVE' })) };
        }
        const data = await res.json();
        const items = (data.items || data || []).filter((a) => a.status === 'ACTIVE' || a.connection_status === 'ACTIVE');
        // Sync each active account to local repo so AI runtime discovers them
        for (const a of items) {
            const slug = a.toolkit_slug || a.toolkit?.slug || a.slug;
            if (slug) {
                composioAccountsRepo.saveAccount({
                    id: a.id,
                    authConfigId: a.auth_config?.id || '',
                    status: 'ACTIVE',
                    toolkitSlug: slug,
                    createdAt: a.created_at || new Date().toISOString(),
                    lastUpdatedAt: new Date().toISOString(),
                });
            }
        }
        // Get connection status for each slug
        const localToolkits = composioAccountsRepo.getConnectedToolkits();
        const remoteSlugs = new Set(items.map((a) => a.toolkit_slug || a.toolkit?.slug || a.slug));
        const allSlugs = new Set([...localToolkits, ...remoteSlugs]);
        const toolkitStatuses = Array.from(allSlugs).map(slug => {
            const remoteAccount = items.find((a) => (a.toolkit_slug || a.toolkit?.slug || a.slug) === slug);
            if (remoteAccount) {
                return {
                    slug,
                    status: 'ACTIVE',
                };
            }
            // Check local repo
            const localAccount = composioAccountsRepo.getAccount(slug);
            if (localAccount && localAccount.status === 'ACTIVE') {
                return {
                    slug,
                    status: 'ACTIVE',
                };
            }
            return {
                slug,
                status: 'INACTIVE',
            };
        });
        return {
            toolkits: toolkitStatuses,
        };
    }
    catch (err) {
        console.error('[composio] listConnected error:', err);
        const localToolkits = composioAccountsRepo.getConnectedToolkits();
        return { toolkits: localToolkits.map(slug => ({ slug, status: 'ACTIVE' })) };
    }
}
/** List available toolkits from Composio */
async function listComposioToolkits() {
    if (!COMPOSIO_API_KEY) {
        return { items: [] };
    }
    try {
        const res = await fetch(`${COMPOSIO_BASE}/toolkits?page_size=100`, {
            headers: composioHeaders(),
        });
        if (!res.ok) {
            return { items: [] };
        }
        const data = await res.json();
        const items = data.items || data || [];
        return {
            items: items.map((t) => ({
                slug: t.slug,
                name: t.name,
                meta: {
                    logo: t.logo,
                    description: t.description,
                },
            })),
        };
    }
    catch (err) {
        console.error('[composio] listToolkits error:', err);
        return { items: [] };
    }
}
/** Search Composio tools */
async function searchComposioTools(query) {
    if (!COMPOSIO_API_KEY) {
        return { tools: [] };
    }
    try {
        const res = await fetch(`${COMPOSIO_BASE}/tools?search=${encodeURIComponent(query)}&page_size=50`, {
            headers: composioHeaders(),
        });
        if (!res.ok) {
            return { tools: [] };
        }
        const data = await res.json();
        const items = data.items || data || [];
        return {
            tools: items.map((t) => ({
                slug: t.slug,
                name: t.name,
                description: t.description,
                toolkit: t.toolkit || t.toolkit_slug,
            })),
        };
    }
    catch (err) {
        console.error('[composio] searchTools error:', err);
        return { tools: [] };
    }
}
/** Disconnect a toolkit */
async function disconnectComposio(toolkitSlug, userId) {
    if (!COMPOSIO_API_KEY) {
        return { success: false, error: 'Connect service is not configured.' };
    }
    try {
        const flowKey = `${userId}:${toolkitSlug}`;
        const flow = activeComposioFlows.get(flowKey);
        if (flow) {
            await fetch(`${COMPOSIO_BASE}/connected_accounts/${flow.connectedAccountId}`, {
                method: 'DELETE',
                headers: composioHeaders(),
            });
            activeComposioFlows.delete(flowKey);
        }
        // Also check local repo for the account and delete from Composio API
        const account = composioAccountsRepo.getAccount(toolkitSlug);
        if (account) {
            await fetch(`${COMPOSIO_BASE}/connected_accounts/${account.id}`, {
                method: 'DELETE',
                headers: composioHeaders(),
            });
        }
        // Always clean up local state
        composioAccountsRepo.deleteAccount(toolkitSlug);
        invalidateCopilotInstructionsCache();
        return { success: true };
    }
    catch (err) {
        console.error('[composio] disconnect error:', err);
        return { success: false, error: 'Failed to disconnect.' };
    }
}
// Handle invoke requests
async function handleInvoke(ws, message) {
    const { channel, reqId, args } = message;
    try {
        // Validate request payload using shared validation
        const validatedArgs = ipcShared.validateRequest(channel, args);
        // Get userId from the WebSocket's auth token
        const token = webTokens.get(ws) || '';
        const userId = token ? getUserIdFromToken(token) : 'anonymous';
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
                result = await workspace.writeFile(validatedArgs.path, validatedArgs.data, validatedArgs.opts);
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
            // Sessions channels — per-user scoped via getUserSessions(ws)
            case 'sessions:create': {
                const userSess = await getUserSessions(ws);
                const sessionId = await userSess.createSession(validatedArgs);
                result = { sessionId };
                break;
            }
            case 'sessions:list': {
                const userSess = await getUserSessions(ws);
                result = { sessions: userSess.listSessions() };
                break;
            }
            case 'sessions:get': {
                const userSess = await getUserSessions(ws);
                result = await userSess.getSession(validatedArgs.sessionId);
                break;
            }
            case 'sessions:getTurn': {
                const userSess = await getUserSessions(ws);
                result = await userSess.getTurn(validatedArgs.turnId);
                break;
            }
            case 'sessions:sendMessage': {
                const userSess = await getUserSessions(ws);
                result = await userSess.sendMessage(validatedArgs.sessionId, validatedArgs.input, validatedArgs.config);
                break;
            }
            case 'sessions:respondToPermission': {
                const userSess = await getUserSessions(ws);
                await userSess.respondToPermission(validatedArgs.turnId, validatedArgs.toolCallId, validatedArgs.decision, validatedArgs.metadata);
                result = { success: true };
                break;
            }
            case 'sessions:respondToAskHuman': {
                const userSess = await getUserSessions(ws);
                await userSess.respondToAskHuman(validatedArgs.turnId, validatedArgs.toolCallId, validatedArgs.answer);
                result = { success: true };
                break;
            }
            case 'sessions:stopTurn': {
                const userSess = await getUserSessions(ws);
                await userSess.stopTurn(validatedArgs.turnId, validatedArgs.reason);
                result = { success: true };
                break;
            }
            case 'sessions:resumeTurn': {
                const userSess = await getUserSessions(ws);
                await userSess.resumeTurn(validatedArgs.sessionId);
                result = { success: true };
                break;
            }
            case 'sessions:setTitle': {
                const userSess = await getUserSessions(ws);
                await userSess.setTitle(validatedArgs.sessionId, validatedArgs.title);
                result = { success: true };
                break;
            }
            case 'sessions:delete': {
                const userSess = await getUserSessions(ws);
                await userSess.deleteSession(validatedArgs.sessionId);
                result = { success: true };
                break;
            }
            // Runs channels
            case 'runs:create':
                result = await runsCore.createRun(validatedArgs);
                break;
            case 'runs:createMessage':
                console.log('[runs:createMessage] voiceOutput:', validatedArgs.voiceOutput, 'voiceInput:', validatedArgs.voiceInput, 'runId:', validatedArgs.runId);
                const messageId = await runsCore.createMessage(validatedArgs.runId, validatedArgs.message, validatedArgs.voiceInput, validatedArgs.voiceOutput, validatedArgs.searchEnabled, validatedArgs.middlePaneContext, validatedArgs.codeMode, validatedArgs.codeCwd, validatedArgs.codePolicy);
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
            case 'models:list': {
                const cfg = await getDefaultModelAndProvider();
                // If we have a local models.json with a non-rowboat provider,
                // return just that model instead of hitting the Rowboat gateway.
                if (cfg.provider !== 'rowboat') {
                    result = [{ provider: cfg.provider, model: cfg.model, name: cfg.model }];
                }
                else if (await isSignedIn()) {
                    result = await listGatewayModels();
                }
                else {
                    result = await listOnboardingModels();
                }
                break;
            }
            case 'models:test':
                result = await testModelConnection(validatedArgs.provider, validatedArgs.model);
                break;
            case 'models:listForProvider':
                try {
                    const models = await listModelsForProvider(validatedArgs.provider);
                    result = { success: true, models };
                }
                catch (err) {
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
                const sessions = container.resolve('sessions').listSessions()
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
                }
                else {
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
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'live-note:set':
                try {
                    await setLiveNote(validatedArgs.filePath, validatedArgs.live);
                    const live = await fetchLiveNote(validatedArgs.filePath);
                    result = { success: true, live };
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'live-note:setActive':
                try {
                    await setLiveNoteActive(validatedArgs.filePath, validatedArgs.active);
                    const live = await fetchLiveNote(validatedArgs.filePath);
                    result = { success: true, live };
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'live-note:delete':
                try {
                    await deleteLiveNote(validatedArgs.filePath);
                    result = { success: true };
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'live-note:stop':
                try {
                    const live = await fetchLiveNote(validatedArgs.filePath);
                    if (!live?.lastRunId) {
                        result = { success: false, error: 'No active run for this note' };
                    }
                    else {
                        await runsCore.stop(live.lastRunId, false);
                        result = { success: true };
                    }
                }
                catch (err) {
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
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'bg-task:patch':
                try {
                    const task = await patchTask(validatedArgs.slug, validatedArgs.partial);
                    result = { success: true, task };
                }
                catch (err) {
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
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'bg-task:delete':
                try {
                    await deleteTask(validatedArgs.slug);
                    result = { success: true };
                }
                catch (err) {
                    result = { success: false, error: err instanceof Error ? err.message : String(err) };
                }
                break;
            case 'bg-task:stop':
                try {
                    const task = await fetchTask(validatedArgs.slug);
                    if (!task?.lastRunId) {
                        result = { success: false, error: 'No active run for this task' };
                    }
                    else {
                        await runsCore.stop(task.lastRunId, false);
                        result = { success: true };
                    }
                }
                catch (err) {
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
            case 'billing:getInfo': {
                // In web-bridge mode with a local provider, there's no billing gateway.
                // Return a free/unlimited plan so the UI doesn't error or show "Unknown".
                try {
                    result = await getBillingInfo();
                }
                catch {
                    // Extract user email from JWT for display
                    let userEmail = null;
                    const token = clientAuthTokens.get(ws) || activeToken;
                    if (token) {
                        try {
                            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
                            userEmail = payload.email ?? payload.sub ?? null;
                        }
                        catch { }
                    }
                    result = {
                        userEmail,
                        userId: null,
                        subscriptionPlanId: 'free',
                        subscriptionStatus: 'active',
                        trialExpiresAt: null,
                        catalog: {
                            plans: [{
                                    id: 'free',
                                    category: 'free',
                                    displayName: 'Free',
                                    monthlyCredits: 999999,
                                    dailyCredits: 999999,
                                    monthlyPriceCents: null,
                                    archived: false,
                                }],
                        },
                        monthly: { sanctionedCredits: 999999, usedCredits: 0, availableCredits: 999999 },
                        daily: { sanctionedCredits: 999999, usedCredits: 0, availableCredits: 999999, usageDay: '' },
                    };
                }
                break;
            }
            // Notifications channels
            case 'notifications:getSettings':
                result = loadNotificationSettings();
                break;
            case 'notifications:setSettings':
                saveNotificationSettings(validatedArgs);
                result = { success: true };
                break;
            // Voice channels
            case 'voice:getConfig': {
                // WEB-ONLY: merge local deepgram config (if present) with SaaS config.
                // The renderer checks config.deepgram to decide voiceAvailable.
                const localConfig = await voice.getVoiceConfig();
                const workerToken = clientAuthTokens.get(ws) || '';
                console.log('[voice:getConfig] workerToken:', !!workerToken, 'localConfig:', JSON.stringify(localConfig).substring(0, 100));
                result = {
                    ...localConfig,
                    // When signed in, SaaS path is available even without local keys
                    rowboat: workerToken ? { connected: true } : null,
                };
                break;
            }
            case 'voice:synthesize': {
                // WEB-ONLY: call the SaaS Worker's /api/tts proxy directly with the
                // user's JWT, instead of relying on voice.synthesizeSpeech() which
                // checks isSignedIn() (reads local oauth.json — always false in web mode).
                const workerToken = clientAuthTokens.get(ws) || '';
                console.log('[voice:synthesize] called, hasToken:', !!workerToken, 'text:', validatedArgs.text?.substring(0, 50));
                if (!workerToken) {
                    result = { error: 'Sign in to use voice output' };
                    break;
                }
                try {
                    const ttsUrl = `${API_URL}/api/tts`;
                    const ttsRes = await fetch(ttsUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${workerToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            text: validatedArgs.text,
                            model: 'aura-asteria-en',
                            encoding: 'mp3',
                        }),
                    });
                    if (!ttsRes.ok) {
                        const errText = await ttsRes.text().catch(() => '');
                        console.error('[voice:synthesize] TTS proxy error:', ttsRes.status, errText);
                        result = { error: 'TTS synthesis failed' };
                    }
                    else {
                        // Deepgram returns raw audio bytes — convert to base64
                        const audioBuf = Buffer.from(await ttsRes.arrayBuffer());
                        result = {
                            audioBase64: audioBuf.toString('base64'),
                            mimeType: 'audio/mpeg',
                        };
                    }
                }
                catch (err) {
                    console.error('[voice:synthesize] Error:', err?.message);
                    result = { error: 'TTS synthesis failed' };
                }
                break;
            }
            case 'voice:synthesizeStreamStart': {
                // WEB-ONLY: streaming TTS — same proxy, but stream chunks back via WS
                const workerToken = clientAuthTokens.get(ws) || '';
                if (!workerToken) {
                    result = { ok: false, error: 'Sign in to use voice output' };
                    break;
                }
                try {
                    const ttsUrl = `${API_URL}/api/tts`;
                    const ttsRes = await fetch(ttsUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${workerToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            text: validatedArgs.text,
                            model: 'aura-asteria-en',
                            encoding: 'mp3',
                        }),
                    });
                    if (!ttsRes.ok) {
                        result = { ok: false, error: 'TTS stream failed' };
                    }
                    else {
                        // Read the full audio and send as a single chunk — the renderer
                        // expects chunk events then a done event on the 'voice:tts-chunk' channel
                        const audioBuf = Buffer.from(await ttsRes.arrayBuffer());
                        const base64 = audioBuf.toString('base64');
                        // Send chunk + done events via the WS connection.
                        // The renderer's useVoiceTTS.ts listens on 'voice:tts-chunk' and
                        // expects { requestId, chunkBase64?, done?, error? }
                        ws.send(JSON.stringify({
                            type: 'event',
                            channel: 'voice:tts-chunk',
                            data: { requestId: validatedArgs.requestId, chunkBase64: base64 },
                        }));
                        ws.send(JSON.stringify({
                            type: 'event',
                            channel: 'voice:tts-chunk',
                            data: { requestId: validatedArgs.requestId, done: true },
                        }));
                        result = { ok: true };
                    }
                }
                catch (err) {
                    console.error('[voice:synthesizeStreamStart] Error:', err?.message);
                    result = { ok: false, error: 'TTS stream failed' };
                }
                break;
            }
            case 'voice:synthesizeStreamCancel':
                // No-op in web mode — the stream is a single fetch, nothing to cancel
                result = { ok: true };
                break;
            case 'voice:ensureMicAccess':
                // WEB-ONLY: mic permission is handled by the browser via getUserMedia
                result = { granted: true };
                break;
            case 'voice:ensureCameraAccess':
                // WEB-ONLY: camera permission is handled by the browser via getUserMedia
                result = { granted: true };
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
                result = await getGoogleDocsConnectionStatus();
                break;
            case 'google-docs:import':
                try {
                    const importResult = await importGoogleDoc(validatedArgs.fileId, validatedArgs.targetFolder);
                    result = importResult;
                }
                catch (err) {
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
                // WEB-ONLY: In web mode, "rowboat connected" = user is signed in via
                // Worker JWT. This is what unlocks voice/video calls (the renderer
                // checks oauthState.config.rowboat.connected to decide whether the
                // SaaS Deepgram/ElevenLabs voice path is available).
                const workerToken = clientAuthTokens.get(ws) || '';
                console.log('[oauth:getState] workerToken:', !!workerToken, 'connected:', !!workerToken);
                result = {
                    config: {
                        rowboat: { connected: !!workerToken },
                        google: { connected: false },
                        granola: { connected: false },
                        slack: { connected: false },
                    },
                };
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
                }
                else {
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
                        onProgress: () => { },
                    });
                    result = { success: true };
                }
                catch (e) {
                    result = { success: false, error: e instanceof Error ? e.message : String(e) };
                }
                break;
            // Channels channels
            case 'channels:getConfig':
                result = await container.resolve('channelsConfigRepo').getConfig();
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
                }
                else {
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
                }
                else {
                    const whoami = await runAgentSlack(['auth', 'whoami'], { timeoutMs: 10000 });
                    if (!whoami.ok) {
                        result = { ok: false, workspaces: [], error: whoami.message, errorKind: whoami.kind };
                    }
                    else {
                        const workspaces = parseWhoamiWorkspaces(whoami.data);
                        if (workspaces.length === 0) {
                            result = { ok: false, workspaces: [], error: 'No signed-in Slack workspaces found in the desktop app.', errorKind: 'not_authed' };
                        }
                        else {
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
                }
                else {
                    const imported = await runAgentSlack(['auth', 'parse-curl'], { timeoutMs: 15000, parseJson: false, input: curl });
                    if (!imported.ok) {
                        result = { ok: false, workspaces: [], error: imported.message, errorKind: imported.kind };
                    }
                    else {
                        const whoami = await runAgentSlack(['auth', 'whoami'], { timeoutMs: 10000 });
                        if (!whoami.ok) {
                            result = { ok: false, workspaces: [], error: whoami.message, errorKind: whoami.kind };
                        }
                        else {
                            const workspaces = parseWhoamiWorkspaces(whoami.data);
                            if (workspaces.length === 0) {
                                result = { ok: false, workspaces: [], error: 'Tokens were saved but no workspace was found. Double-check the copied request.', errorKind: 'not_authed' };
                            }
                            else {
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
                }
                else {
                    const rawChannels = extractArrayPayload(channelResult.data);
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
                }
                else {
                    const limit = Math.min(Math.max(validatedArgs.limit ?? 5, 1), 20);
                    const messages = [];
                    const userNameCache = new Map();
                    try {
                        const knowledgeConfig = knowledgeSourcesRepo.getConfig();
                        const slackSource = knowledgeConfig.sources.find(source => source.id === 'slack' && source.provider === 'slack' && source.enabled);
                        let channels = (slackSource?.scopes ?? [])
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
                                    if (!raw || typeof raw !== 'object')
                                        continue;
                                    const channel = raw;
                                    const id = typeof channel.id === 'string' ? channel.id : undefined;
                                    const name = typeof channel.name === 'string' ? channel.name : id;
                                    const isMember = channel.is_member ?? channel.isMember;
                                    if (!id || !name || isMember === false)
                                        continue;
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
                                if (!raw || typeof raw !== 'object')
                                    continue;
                                const message = raw;
                                const ts = typeof message.ts === 'string' ? message.ts : undefined;
                                const text = slackMessageText(message);
                                if (!ts || !text)
                                    continue;
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
                            .filter((message) => Boolean(message));
                        result = { enabled: true, messages: rankedMessages };
                    }
                    catch (err) {
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
            // Composio channels — real implementation via Composio API
            case 'composio:is-configured':
                result = { configured: !!process.env.COMPOSIO_API_KEY };
                break;
            case 'composio:set-api-key':
                result = { success: false, error: 'API key is managed server-side for the web app.' };
                break;
            case 'composio:initiate-connection': {
                const { toolkitSlug } = args;
                result = await initiateComposioConnection(toolkitSlug, userId);
                break;
            }
            case 'composio:get-connection-status': {
                const { toolkitSlug } = args;
                result = await getComposioConnectionStatus(toolkitSlug, userId);
                break;
            }
            case 'composio:sync-connection': {
                const { connectedAccountId, toolkitSlug } = args;
                result = await syncComposioConnection(connectedAccountId, toolkitSlug, userId);
                break;
            }
            case 'composio:disconnect': {
                const { toolkitSlug } = args;
                result = await disconnectComposio(toolkitSlug, userId);
                break;
            }
            case 'composio:list-connected':
                result = await listConnectedComposio(userId);
                break;
            case 'composio:list-toolkits':
                result = await listComposioToolkits();
                break;
            case 'composio:execute-tool':
                result = { success: false, error: 'Tool execution is handled by the AI runtime directly.' };
                break;
            case 'composio:search-tools': {
                const { query } = args;
                result = await searchComposioTools(query || '');
                break;
            }
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
                    if (app.agentSlugs.length)
                        await appsAgents.syncAppAgents(app);
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
                if (!app)
                    throw new Error(`no such app: ${validatedArgs.folder}`);
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
                result = await registryClient.refreshIndex(validatedArgs.force);
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
                if (!record)
                    throw new Error(`no such app in the catalog: ${validatedArgs.name}`);
                let manifest;
                try {
                    manifest = await registryClient.latestManifest(record);
                }
                catch { /* best effort */ }
                let catReadme;
                try {
                    const res = await fetch(`https://raw.githubusercontent.com/${record.repo}/HEAD/README.md`);
                    if (res.ok)
                        catReadme = await res.text();
                }
                catch { /* best effort */ }
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
                if (!installRecord)
                    throw new Error(`no such app in the catalog: ${validatedArgs.name}`);
                if (!validatedArgs.confirmed) {
                    result = await appsInstaller.previewInstall(installRecord);
                }
                else {
                    const preview = await appsInstaller.previewInstall(installRecord);
                    const installResult = await appsInstaller.installFromRegistry(installRecord, preview);
                    result = installResult;
                }
                break;
            case 'apps:installFromUrl':
                if (!validatedArgs.confirmed) {
                    result = await appsInstaller.previewUrlInstall(validatedArgs.url);
                }
                else {
                    const installResult = await appsInstaller.confirmUrlInstall(validatedArgs.url);
                    result = installResult;
                }
                break;
            case 'apps:uninstall':
                await appsInstaller.uninstallApp(validatedArgs.folder);
                result = { ok: true };
                break;
            case 'apps:checkUpdate':
                result = await appsInstaller.checkUpdate(validatedArgs.folder);
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
                result = await appsPublisher.publishApp(validatedArgs.folder, () => { });
                break;
            case 'apps:publishUpdate':
                result = await appsPublisher.publishUpdate(validatedArgs.folder, validatedArgs.increment);
                break;
            case 'apps:registerExisting':
                result = await appsPublisher.registerExisting(validatedArgs.name, validatedArgs.repo);
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
                }
                catch {
                    result = { agents: {} };
                }
                break;
            case 'agent-schedule:getState':
                const agentScheduleStateRepo = container.resolve('agentScheduleStateRepo');
                try {
                    result = await agentScheduleStateRepo.getState();
                }
                catch {
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
            // ── Browser channels (CDP-backed cloud browser) ──────────────
            case 'browser:getState': {
                result = cdpBrowser.getBrowserState();
                break;
            }
            case 'browser:newTab': {
                result = await cdpBrowser.newTab(validatedArgs.url);
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                break;
            }
            case 'browser:switchTab': {
                result = cdpBrowser.switchTab(validatedArgs.tabId);
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                break;
            }
            case 'browser:closeTab': {
                result = cdpBrowser.closeTab(validatedArgs.tabId);
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                break;
            }
            case 'browser:navigate': {
                // Agentic cookie restore: before navigating, try to restore
                // any saved cookies for the destination domain so the AI
                // doesn't hit a login wall unnecessarily.
                try {
                    const destUrl = validatedArgs.url;
                    let destDomain = '';
                    try {
                        destDomain = new URL(destUrl).hostname.replace(/^www\./, '');
                    }
                    catch { }
                    const uid = wsToUserId.get(ws);
                    if (destDomain && uid) {
                        const sessionRepo = new BrowserSessionRepo(uid);
                        const savedCookies = await sessionRepo.getSessionCookies(destDomain);
                        if (savedCookies && savedCookies.length > 0) {
                            await cdpBrowser.setCookies(savedCookies);
                            console.log(`[browser] Restored ${savedCookies.length} cookies for ${destDomain}`);
                        }
                    }
                }
                catch (e) {
                    // Non-fatal — continue navigation even if cookie restore fails
                    console.error('[browser] Cookie restore failed:', e);
                }
                result = await cdpBrowser.navigate(validatedArgs.url);
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                // Agentic login-wall detection: after navigation, check if the
                // page looks like a login wall. If so, push a login-required
                // event to all connected clients for this user.
                try {
                    const wallCheck = await cdpBrowser.detectLoginWall();
                    if (wallCheck.needsLogin && wallCheck.loginUrl) {
                        const loginData = {
                            url: wallCheck.loginUrl,
                            domain: wallCheck.domain,
                            reason: wallCheck.reason || `Login required for ${wallCheck.domain}`,
                            timestamp: Date.now(),
                        };
                        // Push to all clients — the BrowserLoginCard component picks this up
                        broadcastToSubscribers('browser:loginRequired', loginData);
                        console.log(`[browser] Login wall detected for ${wallCheck.domain}`);
                    }
                }
                catch (e) {
                    // Non-fatal — login detection is a nice-to-have
                    console.error('[browser] Login wall detection failed:', e);
                }
                break;
            }
            case 'browser:back': {
                result = await cdpBrowser.back();
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                break;
            }
            case 'browser:forward': {
                result = await cdpBrowser.forward();
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                break;
            }
            case 'browser:reload': {
                result = await cdpBrowser.reload();
                broadcastToSubscribers('browser:didUpdateState', cdpBrowser.getBrowserState());
                break;
            }
            case 'browser:readPage': {
                result = await cdpBrowser.execute({ action: 'read-page' }, { signal: undefined });
                break;
            }
            // ── Browser Session Management (agentic cookie persistence) ──
            case 'browser:getSessions': {
                const uid = wsToUserId.get(ws);
                if (!uid) {
                    result = { error: 'Not authenticated' };
                    break;
                }
                const repo = new BrowserSessionRepo(uid);
                result = { sessions: await repo.getSessions() };
                break;
            }
            case 'browser:saveSession': {
                const uid = wsToUserId.get(ws);
                if (!uid) {
                    result = { error: 'Not authenticated' };
                    break;
                }
                const domain = validatedArgs.domain;
                // Get cookies from CDP for this domain
                const cookies = await cdpBrowser.getCookies(domain);
                const repo = new BrowserSessionRepo(uid);
                await repo.saveSession(domain, cookies, {
                    lastUrl: validatedArgs.lastUrl,
                    lastTitle: validatedArgs.lastTitle,
                    faviconUrl: validatedArgs.faviconUrl,
                });
                result = { ok: true, cookieCount: cookies.length };
                break;
            }
            case 'browser:restoreSession': {
                const uid = wsToUserId.get(ws);
                if (!uid) {
                    result = { error: 'Not authenticated' };
                    break;
                }
                const domain = validatedArgs.domain;
                const repo = new BrowserSessionRepo(uid);
                const cookies = await repo.getSessionCookies(domain);
                if (cookies.length > 0) {
                    await cdpBrowser.setCookies(cookies);
                    result = { ok: true, restored: cookies.length };
                }
                else {
                    result = { ok: true, restored: 0 };
                }
                break;
            }
            case 'browser:deleteSession': {
                const uid = wsToUserId.get(ws);
                if (!uid) {
                    result = { error: 'Not authenticated' };
                    break;
                }
                const domain = validatedArgs.domain;
                // Also clear from browser
                await cdpBrowser.clearSiteCookies(domain);
                const repo = new BrowserSessionRepo(uid);
                await repo.deleteSession(domain);
                result = { ok: true };
                break;
            }
            case 'browser:getCookies': {
                const domain = validatedArgs.domain;
                result = { cookies: await cdpBrowser.getCookies(domain) };
                break;
            }
            case 'browser:loginToSite': {
                // Navigate to a login URL, then let the user authenticate via the
                // login card in chat. After auth, cookies are captured + saved.
                const loginUrl = validatedArgs.url;
                await cdpBrowser.navigate(loginUrl);
                const state = cdpBrowser.getBrowserState();
                const activeTab = state.tabs?.find((t) => t.id === state.activeTabId);
                result = {
                    ok: true,
                    url: loginUrl,
                    title: activeTab?.title || '',
                    faviconUrl: activeTab?.faviconUrl || '',
                };
                break;
            }
            case 'browser:captureAndSave': {
                // After user logs in via login card, capture cookies + save to DB
                const uid = wsToUserId.get(ws);
                if (!uid) {
                    result = { error: 'Not authenticated' };
                    break;
                }
                const domain = validatedArgs.domain;
                const cookies = await cdpBrowser.getCookies(domain);
                const state = cdpBrowser.getBrowserState();
                const activeTab = state.tabs?.find((t) => t.id === state.activeTabId);
                const repo = new BrowserSessionRepo(uid);
                await repo.saveSession(domain, cookies, {
                    lastUrl: activeTab?.url,
                    lastTitle: activeTab?.title,
                    faviconUrl: activeTab?.faviconUrl,
                });
                result = { ok: true, cookieCount: cookies.length };
                break;
            }
            // turns:subscribe / turns:unsubscribe — no-op in web-bridge mode.
            // Durable turn events are already broadcast via the turnEventBus →
            // broadcastToUserClients(userId, 'turns:events', event) listener set
            // up in ensureUserSessionsLoaded(). These channels exist only in the
            // Electron desktop app where the main process forwards SSE deltas
            // to the renderer for live token streaming. In web mode, all events
            // arrive through the WebSocket 'turns:events' channel directly.
            case 'turns:subscribe':
            case 'turns:unsubscribe':
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
    }
    catch (error) {
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
    // NOTE: Session and turn events are now per-user — see getUserSessions()
    // which subscribes to per-user sessionBus and turnEventBus instances
    // and forwards events only to that user's WS connections via
    // broadcastToUserClients(). This ensures User A never receives User B's
    // session/turn events.
    // Broadcast code run events
    const codeRunFeed = container.resolve('codeRunFeed');
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
