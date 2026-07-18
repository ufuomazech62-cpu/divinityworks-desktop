/**
 * Deepgram TTS (text-to-speech) proxy.
 *
 *   POST /api/tts  { text, model?, encoding?, sample_rate? }
 *   -> proxies to Deepgram /v1/speak with the company API key
 *   -> returns audio bytes (MP3 or raw linear16)
 *
 * The desktop app's voice module calls this instead of hitting Deepgram
 * directly. Users never see the Deepgram key.
 */
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import type { Env, AuthVars } from '../lib/env.js';

export const tts = new Hono<{ Bindings: Env; Variables: AuthVars }>();

tts.use('*', requireAuth);

tts.post('/', async (c) => {
  const body = await c.req.json().catch(() => null) as {
    text?: string;
    model?: string;
    encoding?: string;
    sample_rate?: number;
  } | null;

  if (!body?.text) {
    return c.json({ error: 'text is required' }, 400);
  }

  const model = body.model || 'aura-asteria-en';
  const params = new URLSearchParams({ model });
  if (body.encoding) params.set('encoding', body.encoding);
  if (body.sample_rate) params.set('sample_rate', String(body.sample_rate));

  const dgRes = await fetch(`https://api.deepgram.com/v1/speak?${params}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${c.env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: body.text }),
  });

  if (!dgRes.ok) {
    const errText = await dgRes.text().catch(() => '');
    console.error('[tts] Deepgram error:', dgRes.status, errText);
    return c.json({ error: 'TTS synthesis failed', detail: errText }, dgRes.status as 400);
  }

  // Stream the audio back. Content-Type from Deepgram is audio/mpeg (MP3)
  // or audio/raw (linear16) depending on the encoding param.
  const respHeaders = new Headers(dgRes.headers);
  respHeaders.set('access-control-allow-origin', '*');
  return new Response(dgRes.body, {
    status: 200,
    headers: respHeaders,
  });
});

// Streaming TTS — same endpoint but the desktop app can start playing audio
// chunks as they arrive. Deepgram returns the audio as a stream, so we just
// pipe it through.
tts.post('/stream', async (c) => {
  const body = await c.req.json().catch(() => null) as {
    text?: string;
    model?: string;
  } | null;

  if (!body?.text) {
    return c.json({ error: 'text is required' }, 400);
  }

  const model = body.model || 'aura-asteria-en';

  const dgRes = await fetch(`https://api.deepgram.com/v1/speak?model=${model}&encoding=linear16&sample_rate=24000`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${c.env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: body.text }),
  });

  if (!dgRes.ok) {
    return c.json({ error: 'TTS stream failed' }, dgRes.status as 500);
  }

  return new Response(dgRes.body, {
    status: 200,
    headers: {
      'content-type': 'audio/raw',
      'access-control-allow-origin': '*',
    },
  });
});
