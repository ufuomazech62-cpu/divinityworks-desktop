/**
 * Type definitions for Worker bindings + secrets.
 * wrangler.toml declares the bindings; this file types them.
 */

export interface Env {
  // D1 database
  DB: D1Database;
  // KV namespace
  KV: KVNamespace;

  // Secrets (set via `wrangler secret put`)
  JWT_SECRET: string;
  OPENROUTER_API_KEY: string;
  COMPOSIO_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY?: string;

  // Vars (set in wrangler.toml)
  ENV: string;
  LLM_BASE_URL: string;
  LLM_DEFAULT_MODEL: string;
  COMPOSIO_BASE_URL: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  name: string | null;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface SubscriptionRow {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan_id: string;
  status: string;
  trial_ends_at: number | null;
  current_period_ends_at: number | null;
  canceled_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
}

// Hono context variables set by the auth middleware.
export interface AuthVars {
  user: UserRow | null;
  jwt: import('../lib/crypto.js').JwtClaims | null;
}
