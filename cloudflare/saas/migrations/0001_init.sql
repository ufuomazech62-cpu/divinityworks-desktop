-- Divinity Works SaaS — initial schema
-- Tables: users, refresh_tokens, subscriptions, api_keys
-- Storage: Cloudflare D1 (SQLite-based)

-- Users — the only place user identity lives in the cloud
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,            -- uuid v4
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                -- PBKDF2-SHA256, 100k iterations
  password_salt TEXT NOT NULL,                -- 16 random bytes, hex
  name          TEXT,                          -- optional display name
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Refresh tokens — long-lived (30 days), stored in D1 for revocation
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,              -- uuid v4
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                  -- SHA-256 of the refresh token
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL,
  revoked_at  INTEGER                          -- null until revoked
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- Subscriptions — mirror of Stripe state (Stripe is source of truth)
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  plan_id                 TEXT NOT NULL DEFAULT 'free',
  status                  TEXT NOT NULL DEFAULT 'active',  -- active|trialing|past_due|canceled|incomplete
  trial_ends_at           INTEGER,
  current_period_ends_at  INTEGER,
  canceled_at             INTEGER,
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Usage counters — monthly credits used, by user
-- (One row per user per month. Rolled over by a scheduled Worker job.)
CREATE TABLE IF NOT EXISTS usage_monthly (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month         TEXT NOT NULL,                -- YYYY-MM
  credits_used  INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, month)
);
