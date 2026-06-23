import { randomUUID } from "node:crypto";
import { and, eq, type Database } from "@openharness/db";
import { account } from "@openharness/db/schema";

export async function upsertDiscordAccountLink(
  db: Database,
  input: {
    userId: string;
    discordUserId: string;
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scope?: string | null;
  },
): Promise<void> {
  const existing = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, input.userId), eq(account.providerId, "discord")))
    .limit(1);

  const values = {
    accountId: input.discordUserId,
    accessToken: input.accessToken ?? null,
    refreshToken: input.refreshToken ?? null,
    accessTokenExpiresAt: input.expiresAt ?? null,
    scope: input.scope ?? null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(account).set(values).where(eq(account.id, existing[0].id));
    return;
  }

  await db.insert(account).values({
    id: randomUUID(),
    userId: input.userId,
    providerId: "discord",
    ...values,
  });
}
