import { NextRequest, NextResponse } from 'next/server';
import { authCheck } from '@/app/actions/auth.actions';
import { USE_AUTH } from '@/app/lib/feature_flags';

/**
 * GET /api/me (also exposed as /v1/me via next.config.mjs rewrite)
 *
 * Returns the user identity + billing/usage info in the shape the Divinity
 * desktop app expects (see apps/x/packages/core/src/billing/billing.ts).
 *
 * Authentication: Bearer token (desktop) OR cookie session (web dashboard).
 * Both paths are handled by authCheck() in app/actions/auth.actions.ts.
 *
 * Until billing is wired up, billing fields return null/zero — the shape
 * matters so the desktop's parser doesn't crash.
 */
export async function GET(_req: NextRequest) {
    try {
        let user;
        if (USE_AUTH) {
            user = await authCheck();
        } else {
            user = { id: 'guest_user', email: 'guest@divinityworks.ai' } as any;
        }
        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email ?? null,
            },
            billing: {
                planId: null,
                status: null,
                trialExpiresAt: null,
                usage: {
                    monthly: {
                        sanctionedCredits: 0,
                        usedCredits: 0,
                        availableCredits: 0,
                    },
                    daily: {
                        sanctionedCredits: 0,
                        usedCredits: 0,
                        availableCredits: 0,
                        usageDay: new Date().toISOString().slice(0, 10),
                    },
                },
            },
        });
    } catch (error) {
        console.error('[/api/me] auth failed:', error instanceof Error ? error.message : error);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
}


