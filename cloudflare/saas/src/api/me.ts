/**
 * API routes — all require a Bearer token (see requireAuth middleware).
 *
 *   GET /api/me          -> { user: { id, email, name }, subscription: {...} }
 *   GET /api/llm/models   -> proxy to OpenRouter /models (bearer-authed on our side)
 *   POST /api/llm/chat    -> proxy to OpenRouter /chat/completions
 *   GET /api/composio/*   -> proxy to Composio API
 *   POST /api/composio/*  -> proxy to Composio API
 *   GET /api/billing/*    -> Stripe billing endpoints
 *   POST /api/billing/*   -> Stripe billing endpoints
 */
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import type { Env, AuthVars } from '../lib/env.js';

export const api = new Hono<{ Bindings: Env; Variables: AuthVars }>();

// ---------- GET /api/me ----------
api.get('/me', requireAuth, async (c) => {
  const user = c.get('user')!;
  const subscription = await c.env.DB.prepare(
    'SELECT plan_id, status, trial_ends_at, current_period_ends_at, canceled_at FROM subscriptions WHERE user_id = ?'
  ).bind(user.id).first();

  // Current month's usage
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const usage = await c.env.DB.prepare(
    'SELECT credits_used FROM usage_monthly WHERE user_id = ? AND month = ?'
  ).bind(user.id, month).first();

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? null,
    },
    subscription: {
      planId: subscription?.plan_id ?? 'free',
      status: subscription?.status ?? 'active',
      trialEndsAt: subscription?.trial_ends_at ?? null,
      currentPeriodEndsAt: subscription?.current_period_ends_at ?? null,
      canceledAt: subscription?.canceled_at ?? null,
    },
    usage: {
      month,
      creditsUsed: usage?.credits_used ?? 0,
    },
  });
});
