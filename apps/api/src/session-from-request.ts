import { eq, or } from "drizzle-orm";
import { createDb, schema } from "@openharness/db";
import type { AuthSession } from "./auth.js";
import { env } from "./env.js";

const db = createDb(env.databaseUrl());

function extractBearerToken(headers: Headers): string | null {
  const authHeader = headers.get("Authorization") ?? headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

function bearerTokenCandidates(token: string): string[] {
  const candidates = new Set<string>([token]);
  if (token.includes(".")) {
    candidates.add(token.split(".")[0] ?? token);
  }
  return [...candidates];
}

async function findLiveSession(token: string): Promise<AuthSession | null> {
  const candidates = bearerTokenCandidates(token);
  const row = await db
    .select({
      session: schema.session,
      user: schema.user,
    })
    .from(schema.session)
    .innerJoin(schema.user, eq(schema.session.userId, schema.user.id))
    .where(or(...candidates.map((candidate) => eq(schema.session.token, candidate))))
    .limit(1)
    .then((rows) => rows[0]);

  if (!row || row.session.expiresAt < new Date()) {
    return null;
  }

  return {
    session: row.session,
    user: row.user,
  };
}

/**
 * Resolve a Better Auth session from request headers. Cookie-based sessions are
 * handled by `auth.api.getSession`; this adds Bearer token support for the
 * Electron main process.
 */
export async function resolveAuthSession(
  headers: Headers,
): Promise<AuthSession | null> {
  const bearerToken = extractBearerToken(headers);
  if (!bearerToken) {
    return null;
  }

  return findLiveSession(bearerToken);
}
