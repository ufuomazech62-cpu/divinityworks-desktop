import { z } from 'zod';
import { DIVINITY_AUTH0_DOMAIN, DIVINITY_AUTH0_CLIENT_ID } from '../config/env.js';

/**
 * Discovery configuration - how to get OAuth endpoints
 */
const DiscoverySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('issuer'),
    issuer: z.url().describe('The issuer base url. To discover the endpoints, the client will fetch the .well-known/oauth-authorization-server from this url.'),
  }),
  z.object({
    mode: z.literal('static'),
    authorizationEndpoint: z.url(),
    tokenEndpoint: z.url(),
    revocationEndpoint: z.url().optional(),
  }),
]);

/**
 * Client configuration - how to get client credentials
 */
const ClientSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('static'),
    clientId: z.string().min(1).optional(),
  }),
  z.object({
    mode: z.literal('dcr'),
    // If omitted, should be discovered from auth-server metadata as `registration_endpoint`
    registrationEndpoint: z.url().optional(),
  }),
]);

/**
 * Provider configuration schema
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ProviderConfigSchema = z.record(
  z.string(),
  z.object({
    discovery: DiscoverySchema,
    client: ClientSchema,
    scopes: z.array(z.string()).optional(),
  })
);

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type ProviderConfigEntry = ProviderConfig[string];

/**
 * All configured OAuth providers
 */
const providerConfigs: ProviderConfig = {
  rowboat: {
    discovery: {
      mode: 'issuer',
      issuer: "TBD",
    },
    client: {
      mode: 'dcr',
    },
    scopes: [
      "openid",
      "email",
      "profile",
    ],
  },
  google: {
    discovery: {
      mode: 'issuer',
      issuer: 'https://accounts.google.com',
    },
    client: {
      mode: 'static',
    },
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      // Per-file Drive access (non-restricted): the user grants read/write to a
      // specific doc by choosing it in the Google Picker. Enough to export/
      // download and write back, without the restricted full-drive scope.
      'https://www.googleapis.com/auth/drive.file',
    ],
  },
  'fireflies-ai': {
    discovery: {
      mode: 'issuer',
      issuer: 'https://api.fireflies.ai/.well-known/oauth-authorization-server',
    },
    client: {
      mode: 'dcr',
    },
    scopes: [
      'profile',
      'email',
    ]
  }
};

/**
 * Get provider configuration by name
 */
export async function getProviderConfig(providerName: string): Promise<ProviderConfigEntry> {
  const config = providerConfigs[providerName];
  if (!config) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }
  if (providerName === 'rowboat') {
    // "Sign in with Divinity" uses our Auth0 tenant directly (OIDC, public client
    // + PKCE). This replaces the original Rowboat/Supabase managed-auth issuer, so
    // the desktop no longer depends on the backend's `/v1/config` (which referenced
    // the Supabase issuer) to build the OAuth configuration. Auth0 serves its
    // discovery and token endpoints at well-known paths, so we use static endpoints
    // (no `.well-known` fetch, no Dynamic Client Registration).
    config.discovery = {
      mode: 'static',
      authorizationEndpoint: `https://${DIVINITY_AUTH0_DOMAIN}/authorize`,
      tokenEndpoint: `https://${DIVINITY_AUTH0_DOMAIN}/oauth/token`,
      revocationEndpoint: `https://${DIVINITY_AUTH0_DOMAIN}/oauth/revoke`,
    };
    config.client = { mode: 'static', clientId: DIVINITY_AUTH0_CLIENT_ID };
    config.scopes = ['openid', 'email', 'profile'];
  }
  return config;
}

/**
 * Get list of all configured OAuth providers
 */
export function getAvailableProviders(): string[] {
  return Object.keys(providerConfigs);
}
