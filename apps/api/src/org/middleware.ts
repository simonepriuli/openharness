import type { Context, Next } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { getMembershipForUser } from "./org-db.js";
import type { AppVariables } from "./context.js";

const db = createDb(env.databaseUrl());

export type { AppVariables, OrgContext } from "./context.js";
export { requireOrg, requireOrgAdmin, requireUser } from "./context.js";

export async function orgContextMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> {
  const user = c.get("user");
  if (!user) {
    c.set("org", null);
    await next();
    return;
  }

  try {
    const membership = await getMembershipForUser(db, user.id);
    c.set("org", membership);
  } catch (err) {
    console.error("[org] failed to resolve organization context", err);
    c.set("org", null);
  }

  await next();
}
