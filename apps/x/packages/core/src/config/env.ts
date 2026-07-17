// Cloudflare SaaS Worker — handles auth, LLM proxy (OpenRouter/hy3), Composio
// proxy, billing. The desktop app talks to this single endpoint for all
// cloud-side operations. Agent features run locally and don't touch the cloud.
// Workers.dev URL is the default until dash.divinityworks.space DNS is wired.
export const API_URL =
  process.env.API_URL || 'https://dash.divinityworks.space';

// GitHub OAuth app used for Apps publishing (device flow, public_repo scope).
// Client IDs are public identifiers, not secrets (spec §3).
export const GITHUB_OAUTH_CLIENT_ID =
  process.env.ROWBOAT_GITHUB_CLIENT_ID || 'Ov23liAka106zKEovj4B';

// @deprecated — Auth0 is no longer used. Sign-in goes through the SaaS Worker.
// These stubs exist only so `providers.ts` (which is no longer called for the
// 'rowboat' provider — see oauth-handler.ts) keeps type-checking. Will be
// removed when providers.ts is cleaned up.
export const DIVINITY_AUTH0_DOMAIN = '';
export const DIVINITY_AUTH0_CLIENT_ID = '';
