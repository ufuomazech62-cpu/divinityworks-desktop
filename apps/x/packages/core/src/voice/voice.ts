import * as fs from 'fs/promises';
import * as path from 'path';
import { isSignedIn } from '../account/account.js';
import { getAccessToken } from '../auth/tokens.js';
import { WorkDir } from '../config/config.js';
import { API_URL } from '../config/env.js';

export interface VoiceConfig {
    deepgram: { apiKey: string } | null;
    elevenlabs: { apiKey: string; voiceId?: string } | null;
}

async function readJsonConfig(filename: string): Promise<Record<string, unknown> | null> {
    try {
        const configPath = path.join(WorkDir, 'config', filename);
        const raw = await fs.readFile(configPath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function getVoiceConfig(): Promise<VoiceConfig> {
    const dgConfig = await readJsonConfig('deepgram.json');
    const elConfig = await readJsonConfig('elevenlabs.json');

    return {
        deepgram: dgConfig?.apiKey ? { apiKey: dgConfig.apiKey as string } : null,
        elevenlabs: elConfig?.apiKey
            ? { apiKey: elConfig.apiKey as string, voiceId: elConfig.voiceId as string | undefined }
            : null,
    };
}

/**
 * Resolve the TTS endpoint. When the user is signed in to Divinity, we use
 * the SaaS Worker's /api/tts proxy (Deepgram Aura) with the company key.
 * When not signed in, fall back to BYOK (user's own ElevenLabs key in
 * ~/.rowboat/config/elevenlabs.json).
 */
async function resolveTtsEndpoint(streaming: boolean): Promise<{ url: string; headers: Record<string, string>; body: string }> {
    const config = await getVoiceConfig();
    const signedIn = await isSignedIn();

    if (signedIn) {
        // Use the SaaS Worker's Deepgram Aura TTS proxy. The company's
        // Deepgram key is injected server-side — the desktop never sees it.
        const accessToken = await getAccessToken();
        const url = streaming
            ? `${API_URL}/api/tts/stream`
            : `${API_URL}/api/tts`;
        return {
            url,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: '', // filled by caller
                model: 'aura-asteria-en',
            }),
        };
    }

    // BYOK fallback — user has their own ElevenLabs key
    if (!config.elevenlabs) {
        throw new Error('Voice output requires sign-in. Sign in to Divinity to use voice.');
    }
    const voiceId = config.elevenlabs.voiceId || 's3TPKV1kjDlVtZbl4Ksh';
    return {
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}${streaming ? '/stream' : ''}`,
        headers: {
            'xi-api-key': config.elevenlabs.apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text: '',
            model_id: 'eleven_flash_v2_5',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
    };
}

export async function synthesizeSpeech(text: string): Promise<{ audioBase64: string; mimeType: string }> {
    const { url, headers, body: bodyTemplate } = await resolveTtsEndpoint(false);
    console.log('[voice] synthesizing speech via SaaS Worker, text length:', text.length);

    // Inject the text into the body
    const body = JSON.parse(bodyTemplate);
    body.text = text;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        console.error('[voice] TTS API error:', response.status, errText);
        throw new Error(`TTS API error ${response.status}: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    console.log('[voice] synthesized audio, base64 length:', audioBase64.length);
    return { audioBase64, mimeType: contentType };
}

/**
 * Streaming synthesis: invokes `onChunk` with audio bytes as they arrive so
 * playback can start immediately. Resolves when the stream ends; rejects on
 * HTTP/stream errors. Abort via the provided signal.
 */
export async function synthesizeSpeechStream(
    text: string,
    onChunk: (chunk: Buffer) => void,
    signal?: AbortSignal,
): Promise<void> {
    const { url, headers, body: bodyTemplate } = await resolveTtsEndpoint(true);
    console.log('[voice] streaming speech synthesis via SaaS Worker, text length:', text.length);

    const body = JSON.parse(bodyTemplate);
    body.text = text;

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: signal ?? null,
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        console.error('[voice] TTS stream API error:', response.status, errText);
        throw new Error(`TTS API error ${response.status}: ${errText}`);
    }
    if (!response.body) {
        throw new Error('TTS API returned no body');
    }

    const reader = response.body.getReader();
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
            onChunk(Buffer.from(value));
        }
    }
}
