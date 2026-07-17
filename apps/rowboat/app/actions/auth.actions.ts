"use server";
import { auth0 } from "../lib/auth0";
import { USE_AUTH } from "../lib/feature_flags";
import { User } from "@/src/entities/models/user";
import { getUserFromSessionId, GUEST_DB_USER } from "../lib/auth";
import { z } from "zod";
import { container } from "@/di/container";
import { IUsersRepository } from "@/src/application/repositories/users.repository.interface";
import { validateBearerToken } from "../lib/bearer-auth";
import { headers } from "next/headers";

const usersRepository = container.resolve<IUsersRepository>("usersRepository");

/**
 * Resolves the current user from either:
 *   1. An `Authorization: Bearer <token>` header (used by the Divinity desktop
 *      app, which authenticates via Auth0 PKCE), OR
 *   2. The @auth0/nextjs-auth0 cookie session (used by the web dashboard).
 *
 * Bearer tokens are validated against Auth0's JWKS. The resulting `sub` claim
 * is used to look up (or auto-create) the database user, exactly as the cookie
 * path does.
 */
export async function authCheck(): Promise<z.infer<typeof User>> {
    if (!USE_AUTH) {
        return GUEST_DB_USER;
    }

    // 1. Try Bearer token (desktop app flow).
    const hdrs = await headers();
    const authHeader = hdrs.get('authorization') || hdrs.get('Authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
        try {
            const authed = await validateBearerToken(authHeader);
            const usersRepo = container.resolve<IUsersRepository>("usersRepository");
            let dbUser = await usersRepo.fetchByAuth0Id(authed.sub);
            if (!dbUser) {
                // Auto-create on first sign-in, matching the cookie path's behavior.
                dbUser = await usersRepo.create({
                    auth0Id: authed.sub,
                    email: authed.email ?? '',
                });
                console.log(`[auth] created new user ${dbUser.id} for bearer sub=${authed.sub}`);
            }
            return dbUser;
        } catch (err) {
            throw new Error(`Bearer token validation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // 2. Fall back to cookie session (web dashboard flow).
    const { user } = await auth0.getSession() || {};
    if (!user) {
        throw new Error('User not authenticated');
    }

    const dbUser = await getUserFromSessionId(user.sub);
    if (!dbUser) {
        throw new Error('User record not found');
    }
    return dbUser;
}

const EmailOnly = z.object({
    email: z.string().email(),
});

export async function updateUserEmail(email: string) {
    if (!USE_AUTH) {
        return;
    }
    const user = await authCheck();

    if (!email.trim()) {
        throw new Error('Email is required');
    }
    if (!EmailOnly.safeParse({ email }).success) {
        throw new Error('Invalid email');
    }

    // update customer email in db
    await usersRepository.updateEmail(user.id, email);
}
