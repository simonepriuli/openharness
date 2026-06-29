import type { Context, Next } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { isCloudWorkerAuthorized } from "../cloud-worker/internal-auth.js";
import { getCloudWorkerOrgContext, getMembershipForUser } from "./org-db.js";
import type { AppVariables } from "./context.js";

const db = createDb(env.databaseUrl());

export type { AppVariables, OrgContext } from "./context.js";
export { requireOrg, requireOrgAdmin, requireUser } from "./context.js";

export async function orgContextMiddleware(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> {
  const orgIdHeader = c.req.header("X-Organization-Id")?.trim();
  if (orgIdHeader && isCloudWorkerAuthorized(c.req.header("authorization"))) {
    try {
      const org = await getCloudWorkerOrgContext(db, orgIdHeader);
      if (org) {
        c.set("org", {
          memberId: "cloud-worker",
          organizationId: org.id,
          organizationName: org.name,
          organizationSlug: org.slug,
          cloudWorkersEnabled: org.cloudWorkersEnabled,
          role: "member",
        });
        await next();
        return;
      }
    } catch (err) {
      console.error("[org] failed to resolve cloud worker organization context", err);
    }
  }

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
