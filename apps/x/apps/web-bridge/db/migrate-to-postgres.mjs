/**
 * Migration script: JSONL files → PostgreSQL
 * 
 * Reads existing session, turn, and run JSONL files from per-user
 * directories and inserts them into the PostgreSQL database.
 * 
 * Usage: node migrate-to-postgres.mjs
 * 
 * Scans ~/.divinity/users/{userId}/storage/ for JSONL files.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKDIR = process.env.ROWBOAT_WORKDIR || path.join(process.env.HOME, '.divinity');

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  user: 'divinity',
  password: 'divinity_secure_2026',
  database: 'divinity',
  max: 10,
});

async function readJsonlFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  if (raw.length === 0) return [];
  const lines = raw.split('\n');
  const trailing = lines.pop();
  if (trailing !== '') {
    console.warn(`  ⚠ File doesn't end with newline: ${filePath}`);
    if (trailing.trim()) lines.push(trailing);
  }
  return lines.filter(l => l.trim()).map(l => JSON.parse(l));
}

async function migrateUser(userId) {
  const userDir = path.join(WORKDIR, 'users', userId);
  const sessionsDir = path.join(userDir, 'storage', 'sessions');
  const turnsDir = path.join(userDir, 'storage', 'turns');
  const runsDir = path.join(userDir, 'storage', 'runs');

  console.log(`\n=== Migrating user: ${userId} ===`);

  // Migrate sessions
  let sessionCount = 0;
  try {
    const files = await fs.readdir(sessionsDir, { recursive: true });
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const fullPath = path.join(sessionsDir, file);
      const events = await readJsonlFile(fullPath);
      if (events.length === 0) continue;
      
      const sessionId = events[0].sessionId;
      const title = events.find(e => e.title)?.title || '';
      const createdAt = events[0].ts || new Date().toISOString();
      
      await pool.query(
        `INSERT INTO sessions (id, user_id, title, created_at, updated_at, events)
         VALUES ($1, $2, $3, $4, $4, $5)
         ON CONFLICT (id) DO UPDATE SET events = $5, title = $3`,
        [sessionId, userId, title, createdAt, JSON.stringify(events)]
      );
      sessionCount++;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`  Session migration error:`, e.message);
  }
  console.log(`  ✓ Sessions: ${sessionCount}`);

  // Migrate turns
  let turnCount = 0;
  try {
    const files = await fs.readdir(turnsDir, { recursive: true });
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const fullPath = path.join(turnsDir, file);
      const events = await readJsonlFile(fullPath);
      if (events.length === 0) continue;
      
      const turnId = events[0].turnId;
      const sessionId = events[0].sessionId || '';
      const createdAt = events[0].ts || new Date().toISOString();
      
      await pool.query(
        `INSERT INTO turns (id, user_id, session_id, created_at, events)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET events = $5`,
        [turnId, userId, sessionId, createdAt, JSON.stringify(events)]
      );
      turnCount++;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`  Turn migration error:`, e.message);
  }
  console.log(`  ✓ Turns: ${turnCount}`);

  // Migrate runs
  let runCount = 0;
  try {
    const files = await fs.readdir(runsDir, { recursive: true });
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    for (const file of jsonlFiles) {
      const fullPath = path.join(runsDir, file);
      const events = await readJsonlFile(fullPath);
      if (events.length === 0) continue;
      
      const runId = events[0].runId || path.basename(file, '.jsonl');
      const workDir = events[0].workDir || '';
      const createdAt = events[0].ts || new Date().toISOString();
      
      await pool.query(
        `INSERT INTO runs (id, user_id, work_dir, created_at, events)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET events = $5`,
        [runId, userId, workDir, createdAt, JSON.stringify(events)]
      );
      runCount++;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`  Run migration error:`, e.message);
  }
  console.log(`  ✓ Runs: ${runCount}`);

  // Update session turn_count and latest_turn_id
  const sessionRes = await pool.query(`SELECT id, events FROM sessions WHERE user_id = $1`, [userId]);
  for (const row of sessionRes.rows) {
    const events = row.events;
    let turnCount = 0;
    let latestTurnId = null;
    for (const e of events) {
      if (e.type === 'turn_appended') {
        turnCount++;
        latestTurnId = e.turnId;
      }
    }
    await pool.query(
      `UPDATE sessions SET turn_count = $3, latest_turn_id = $4 WHERE id = $1 AND user_id = $2`,
      [row.id, userId, turnCount, latestTurnId]
    );
  }

  return { sessionCount, turnCount, runCount };
}

async function main() {
  const usersDir = path.join(WORKDIR, 'users');
  let userDirs = [];
  try {
    const entries = await fs.readdir(usersDir, { withFileTypes: true });
    userDirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch (e) {
    console.error('No users directory found');
    process.exit(1);
  }

  console.log(`Found ${userDirs.length} users to migrate`);
  
  let totalSessions = 0, totalTurns = 0, totalRuns = 0;
  for (const userId of userDirs) {
    const result = await migrateUser(userId);
    totalSessions += result.sessionCount;
    totalTurns += result.turnCount;
    totalRuns += result.runCount;
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`  Total sessions: ${totalSessions}`);
  console.log(`  Total turns: ${totalTurns}`);
  console.log(`  Total runs: ${totalRuns}`);

  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
