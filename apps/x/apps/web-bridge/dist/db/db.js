/**
 * Database-backed repositories for Divinity Works.
 *
 * Drop-in replacements for FSSessionRepo, FSTurnRepo, and FSRunsRepo
 * that use PostgreSQL instead of JSONL files. Each method maintains
 * the same interface as the file-based repos so they can be swapped
 * in without changing any calling code.
 *
 * Multi-tenancy: every query is scoped by user_id. RLS provides
 * defense-in-depth via current_setting('app.current_user_id').
 */
import pg from 'pg';
const { Pool } = pg;
// Singleton pool — one connection pool for the entire process
let pool = null;
export function getDbPool() {
    if (!pool) {
        const dbUrl = process.env.DATABASE_URL;
        let config = {
            host: process.env.PGHOST || 'localhost',
            port: parseInt(process.env.PGPORT || '5432'),
            user: process.env.PGUSER || 'divinity',
            password: process.env.PGPASSWORD || 'divinity_secure_2026',
            database: process.env.PGDATABASE || 'divinity',
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        };
        if (dbUrl) {
            // Parse DATABASE_URL for environments that set it (e.g. systemd)
            try {
                const u = new URL(dbUrl);
                config = {
                    host: u.hostname,
                    port: parseInt(u.port || '5432'),
                    user: u.username,
                    password: decodeURIComponent(u.password),
                    database: u.pathname.slice(1),
                    max: 20,
                    idleTimeoutMillis: 30000,
                    connectionTimeoutMillis: 5000,
                };
            }
            catch (e) {
                // fall back to individual env vars
            }
        }
        pool = new Pool(config);
        pool.on('error', (err) => {
            console.error('[db] Pool error:', err.message);
        });
        console.log('[db] PostgreSQL pool created');
    }
    return pool;
}
/**
 * Set the current user ID for RLS. Call this at the start of each request.
 */
export async function setUserContext(client, userId) {
    // Use SET (not SET LOCAL) so it persists for the session.
    // userId comes from JWT sub claim — safe from SQL injection.
    // Validate format to be extra safe.
    if (!/^[a-f0-9-]+$/i.test(userId)) {
        throw new Error('Invalid user ID format');
    }
    await client.query(`SET app.current_user_id = '${userId}'`);
}
// ============================================================================
// DBSessionRepo — replaces FSSessionRepo
// ============================================================================
export class DBSessionRepo {
    userId;
    mutex;
    locks = new Map();
    constructor({ userId }) {
        this.userId = userId;
        this.mutex = {
            run: (key, fn) => {
                const existing = this.locks.get(key);
                const promise = (existing || Promise.resolve()).then(fn, fn);
                this.locks.set(key, promise);
                promise.finally(() => {
                    if (this.locks.get(key) === promise)
                        this.locks.delete(key);
                });
                return promise;
            },
        };
    }
    async create(event) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const sessionId = event.sessionId;
            const events = JSON.stringify([event]);
            await client.query(`INSERT INTO sessions (id, user_id, title, created_at, updated_at, events)
         VALUES ($1, $2, $3, $4, $4, $5)
         ON CONFLICT (id) DO NOTHING`, [sessionId, this.userId, event.title || '', event.ts || new Date().toISOString(), events]);
        }
        finally {
            client.release();
        }
    }
    async read(sessionId) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT events FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, this.userId]);
            if (res.rows.length === 0) {
                throw new Error(`session not found: ${sessionId}`);
            }
            return res.rows[0].events;
        }
        finally {
            client.release();
        }
    }
    async append(sessionId, events) {
        if (events.length === 0)
            return;
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            // Use jsonb_insert to append each event to the array
            // Actually, use jsonb || to merge arrays
            await client.query(`UPDATE sessions
         SET events = events || $3::jsonb,
             updated_at = $4
         WHERE id = $1 AND user_id = $2`, [sessionId, this.userId, JSON.stringify(events), new Date().toISOString()]);
        }
        finally {
            client.release();
        }
    }
    async withLock(sessionId, fn) {
        return this.mutex.run(sessionId, fn);
    }
    async listSessionIds() {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`, [this.userId]);
            return res.rows.map((r) => r.id);
        }
        finally {
            client.release();
        }
    }
    async delete(sessionId) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, this.userId]);
            if (res.rowCount === 0) {
                throw new Error(`session not found: ${sessionId}`);
            }
        }
        finally {
            client.release();
        }
    }
    async setTitle(sessionId, title) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`UPDATE sessions SET title = $3, updated_at = $4 WHERE id = $1 AND user_id = $2`, [sessionId, this.userId, title, new Date().toISOString()]);
        }
        finally {
            client.release();
        }
    }
    /**
     * Bulk upsert — used by migration script
     */
    async upsert(sessionId, events, title, createdAt) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`INSERT INTO sessions (id, user_id, title, created_at, updated_at, events)
         VALUES ($1, $2, $3, $4, $4, $5)
         ON CONFLICT (id) DO UPDATE SET events = $5, title = $3, updated_at = $4`, [sessionId, this.userId, title || '', createdAt || new Date().toISOString(), JSON.stringify(events)]);
        }
        finally {
            client.release();
        }
    }
}
// ============================================================================
// DBTurnRepo — replaces FSTurnRepo
// ============================================================================
export class DBTurnRepo {
    userId;
    mutex;
    locks = new Map();
    constructor({ userId }) {
        this.userId = userId;
        this.mutex = {
            run: (key, fn) => {
                const existing = this.locks.get(key);
                const promise = (existing || Promise.resolve()).then(fn, fn);
                this.locks.set(key, promise);
                promise.finally(() => {
                    if (this.locks.get(key) === promise)
                        this.locks.delete(key);
                });
                return promise;
            },
        };
    }
    async create(event) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`INSERT INTO turns (id, user_id, session_id, created_at, events)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`, [event.turnId, this.userId, event.sessionId || '', event.ts || new Date().toISOString(), JSON.stringify([event])]);
        }
        finally {
            client.release();
        }
    }
    async read(turnId) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT events FROM turns WHERE id = $1 AND user_id = $2`, [turnId, this.userId]);
            if (res.rows.length === 0) {
                throw new Error(`turn not found: ${turnId}`);
            }
            return res.rows[0].events;
        }
        finally {
            client.release();
        }
    }
    async append(turnId, events) {
        if (events.length === 0)
            return;
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`UPDATE turns
         SET events = events || $3::jsonb
         WHERE id = $1 AND user_id = $2`, [turnId, this.userId, JSON.stringify(events)]);
        }
        finally {
            client.release();
        }
    }
    async withLock(turnId, fn) {
        return this.mutex.run(turnId, fn);
    }
    async upsert(turnId, events, sessionId) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`INSERT INTO turns (id, user_id, session_id, created_at, events)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET events = $5`, [turnId, this.userId, sessionId || '', events[0]?.ts || new Date().toISOString(), JSON.stringify(events)]);
        }
        finally {
            client.release();
        }
    }
}
// ============================================================================
// DBRunsRepo — replaces FSRunsRepo
// ============================================================================
export class DBRunsRepo {
    userId;
    constructor({ userId }) {
        this.userId = userId;
    }
    async create(opts) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const runId = opts.runId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await client.query(`INSERT INTO runs (id, user_id, work_dir, events)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`, [runId, this.userId, opts.workDir || '', JSON.stringify(opts.events || [])]);
            return runId;
        }
        finally {
            client.release();
        }
    }
    async fetch(runId) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT events, work_dir FROM runs WHERE id = $1 AND user_id = $2`, [runId, this.userId]);
            if (res.rows.length === 0)
                return null;
            return {
                runId,
                events: res.rows[0].events,
                workDir: res.rows[0].work_dir,
            };
        }
        finally {
            client.release();
        }
    }
    async list(cursor) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            let query = `SELECT id, work_dir, created_at FROM runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`;
            let params = [this.userId];
            if (cursor) {
                query = `SELECT id, work_dir, created_at FROM runs WHERE user_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 50`;
                params = [this.userId, cursor];
            }
            const res = await client.query(query, params);
            return res.rows;
        }
        finally {
            client.release();
        }
    }
    async listByWorkDir(workDir) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT id, work_dir, created_at FROM runs WHERE user_id = $1 AND work_dir = $2 ORDER BY created_at DESC`, [this.userId, workDir]);
            return res.rows;
        }
        finally {
            client.release();
        }
    }
    async appendEvents(runId, events) {
        if (events.length === 0)
            return;
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`UPDATE runs SET events = events || $3::jsonb WHERE id = $1 AND user_id = $2`, [runId, this.userId, JSON.stringify(events)]);
        }
        finally {
            client.release();
        }
    }
    async delete(runId) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`DELETE FROM runs WHERE id = $1 AND user_id = $2`, [runId, this.userId]);
            if (res.rowCount === 0) {
                throw new Error(`run not found: ${runId}`);
            }
        }
        finally {
            client.release();
        }
    }
}
// ── Browser Session Repository ─────────────────────────────────
// Stores per-user browser cookies so the AI can maintain logged-in
// sessions across browser restarts. Each row = one site's cookies
// for one user.
export class BrowserSessionRepo {
    userId;
    constructor(userId) {
        this.userId = userId;
    }
    /** Create the browser_sessions table if it doesn't exist. */
    static async ensureSchema() {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await client.query(`
        CREATE TABLE IF NOT EXISTS browser_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          domain TEXT NOT NULL,
          cookies JSONB NOT NULL DEFAULT '[]'::jsonb,
          last_url TEXT,
          last_title TEXT,
          favicon_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(user_id, domain)
        )
      `);
            await client.query(`
        ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS browser_sessions_user_isolation ON browser_sessions;
        CREATE POLICY browser_sessions_user_isolation
          ON browser_sessions
          USING (user_id::text = current_setting('app.current_user_id', true));
      `);
            console.log('[db] browser_sessions table ready');
        }
        catch (e) {
            console.error('[db] browser_sessions schema error:', e);
        }
        finally {
            client.release();
        }
    }
    /** Upsert cookies for a domain. */
    async saveSession(domain, cookies, opts) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`INSERT INTO browser_sessions (user_id, domain, cookies, last_url, last_title, favicon_url, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, now())
         ON CONFLICT (user_id, domain)
         DO UPDATE SET cookies = $3::jsonb, last_url = $4, last_title = $5, favicon_url = $6, updated_at = now()`, [this.userId, domain, JSON.stringify(cookies), opts?.lastUrl || null, opts?.lastTitle || null, opts?.faviconUrl || null]);
        }
        finally {
            client.release();
        }
    }
    /** Get all saved sessions for this user. */
    async getSessions() {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT domain, cookies, last_url, last_title, favicon_url, updated_at
         FROM browser_sessions WHERE user_id = $1 ORDER BY updated_at DESC`, [this.userId]);
            return res.rows.map((r) => ({
                domain: r.domain,
                cookieCount: Array.isArray(r.cookies) ? r.cookies.length : (r.cookies ? r.cookies.length : 0),
                lastUrl: r.last_url,
                lastTitle: r.last_title,
                faviconUrl: r.favicon_url,
                updatedAt: r.updated_at,
            }));
        }
        finally {
            client.release();
        }
    }
    /** Get cookies for a specific domain. */
    async getSessionCookies(domain) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            const res = await client.query(`SELECT cookies FROM browser_sessions WHERE user_id = $1 AND domain = $2`, [this.userId, domain]);
            if (res.rows.length === 0)
                return [];
            const c = res.rows[0].cookies;
            return Array.isArray(c) ? c : [];
        }
        finally {
            client.release();
        }
    }
    /** Delete a session for a domain. */
    async deleteSession(domain) {
        const pool = getDbPool();
        const client = await pool.connect();
        try {
            await setUserContext(client, this.userId);
            await client.query(`DELETE FROM browser_sessions WHERE user_id = $1 AND domain = $2`, [this.userId, domain]);
        }
        finally {
            client.release();
        }
    }
}
