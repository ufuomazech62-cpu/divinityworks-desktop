#!/usr/bin/env node
// Migration script: moves global sessions/runs/turns to per-user directories.
// Run once on the VM before starting the updated web-bridge.
//
// Usage: node migrate-to-per-user.mjs <userId>
//   where <userId> is the JWT `sub` claim (typically email-based)

import { resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync, readdirSync, cpSync, existsSync, renameSync, statSync } from 'fs';

const WorkDir = resolve(homedir(), '.divinity');
const userId = process.argv[2];

if (!userId) {
  console.error('Usage: node migrate-to-per-user.mjs <userId>');
  console.error('  userId = JWT sub claim (typically the user email)');
  process.exit(1);
}

const userDir = resolve(WorkDir, 'users', userId);
const userStorage = resolve(userDir, 'storage');

console.log(`Migrating data to per-user directory: ${userDir}`);

// 1. Migrate sessions: ~/.divinity/storage/sessions → ~/.divinity/users/<userId>/storage/sessions
const globalSessions = resolve(WorkDir, 'storage', 'sessions');
const userSessions = resolve(userStorage, 'sessions');
if (existsSync(globalSessions)) {
  console.log('  Migrating sessions...');
  mkdirSync(userSessions, { recursive: true });
  // Copy the date-organized directory tree
  cpSync(globalSessions, userSessions, { recursive: true });
  console.log('  ✓ Sessions migrated');
} else {
  console.log('  No global sessions directory found, skipping');
}

// 2. Migrate turns: ~/.divinity/storage/turns → ~/.divinity/users/<userId>/storage/turns
const globalTurns = resolve(WorkDir, 'storage', 'turns');
const userTurns = resolve(userStorage, 'turns');
if (existsSync(globalTurns)) {
  console.log('  Migrating turns...');
  mkdirSync(userTurns, { recursive: true });
  cpSync(globalTurns, userTurns, { recursive: true });
  console.log('  ✓ Turns migrated');
} else {
  console.log('  No global turns directory found, skipping');
}

// 3. Migrate runs: ~/.divinity/runs → ~/.divinity/users/<userId>/storage/runs
const globalRuns = resolve(WorkDir, 'runs');
const userRuns = resolve(userStorage, 'runs');
if (existsSync(globalRuns)) {
  console.log('  Migrating runs...');
  mkdirSync(userRuns, { recursive: true });
  cpSync(globalRuns, userRuns, { recursive: true });
  console.log('  ✓ Runs migrated');
} else {
  console.log('  No global runs directory found, skipping');
}

console.log('\nMigration complete!');
console.log(`\nNote: Original data was COPIED (not moved) to preserve the fallback.`);
console.log(`The old global directories still exist but the new code will use`);
console.log(`the per-user directories going forward.`);
