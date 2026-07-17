import container from '../di/container.js';
import { IOAuthRepo } from './repo.js';
import { OAuthTokens } from './types.js';
import { API_URL } from '../config/env.js';

let refreshInFlight: Promise<OAuthTokens> | null = null;

/**
 * Refresh the Divinity access token by calling the SaaS Worker's
 * /auth/refresh endpoint. The Worker validates the refresh_token (stored
 * SHA-256-hashed in D1), rotates it (old one revoked, new one issued),
 * and returns a fresh access_token + refresh_token pair.
 */
async function performRefresh(tokens: OAuthTokens): Promise<OAuthTokens> {
    console.log("Refreshing Divinity access token via SaaS Worker");
    if (!tokens.refresh_token) {
        throw new Error('Divinity token expired and no refresh token available. Please sign in again.');
    }

    const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tokens.refresh_token }),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Token refresh failed (${response.status}): ${text}. Please sign in again.`);
    }

    const body = await response.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
    };

    // Decode the JWT to get the actual expiry timestamp.
    const payloadB64 = body.access_token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const expiresAt = payload.exp ?? Math.floor(Date.now() / 1000) + body.expires_in;

    const refreshed: OAuthTokens = {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: expiresAt,
        token_type: 'Bearer',
        scopes: tokens.scopes,
    };

    const oauthRepo = container.resolve<IOAuthRepo>('oauthRepo');
    await oauthRepo.upsert('rowboat', { tokens: refreshed });

    return refreshed;
}

function isTokenExpired(tokens: OAuthTokens): boolean {
    // Refresh 30s before actual expiry to avoid race conditions
    const now = Math.floor(Date.now() / 1000);
    return tokens.expires_at <= now + 30;
}

export async function getAccessToken(): Promise<string> {
    const oauthRepo = container.resolve<IOAuthRepo>('oauthRepo');
    const { tokens } = await oauthRepo.read('rowboat');
    if (!tokens) {
        throw new Error('Not signed into Divinity');
    }

    if (!isTokenExpired(tokens)) {
        return tokens.access_token;
    }

    if (!refreshInFlight) {
        refreshInFlight = performRefresh(tokens).finally(() => {
            refreshInFlight = null;
        });
    }
    const refreshed = await refreshInFlight;
    return refreshed.access_token;
}
