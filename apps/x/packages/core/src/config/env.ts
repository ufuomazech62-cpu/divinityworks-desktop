export const API_URL =
  process.env.API_URL || 'https://api.divinityworks.space';

// GitHub OAuth app used for Apps publishing (device flow, public_repo scope).
// Client IDs are public identifiers, not secrets (spec §3).
export const GITHUB_OAUTH_CLIENT_ID =
  process.env.ROWBOAT_GITHUB_CLIENT_ID || 'Ov23liAka106zKEovj4B';

// Auth0 tenant used for the "Sign in with Divinity" managed login on the desktop.
// These are public identifiers (domain + client id) — safe to ship in the binary.
// The desktop uses a public client (PKCE, no secret) against this tenant, replacing
// the old Rowboat/Supabase managed-auth issuer. Override at launch with
// DIVINITY_AUTH0_DOMAIN / DIVINITY_AUTH0_CLIENT_ID if you provision a dedicated
// Native Auth0 application for the desktop.
export const DIVINITY_AUTH0_DOMAIN =
  process.env.DIVINITY_AUTH0_DOMAIN || 'dev-6y2css63pk2d2pwd.us.auth0.com';
export const DIVINITY_AUTH0_CLIENT_ID =
  process.env.DIVINITY_AUTH0_CLIENT_ID || 'AS8moluKc8B8SrnGp2ie0SYOIlqLdfzf';
