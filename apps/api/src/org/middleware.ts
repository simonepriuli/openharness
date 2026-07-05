import type { Context, Next } from "hono";
import { Result } from "better-result";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { isCloudWorkerAuthorized } from "../cloud-worker/internal-auth.js";
import { tryPromiseAllowFailure } from "../result-helpers.js";
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
    const orgResult = await tryPromiseAllowFailure(() =>
      getCloudWorkerOrgContext(db, orgIdHeader),
    );
    if (Result.isError(orgResult)) {
      console.error("[org] failed to resolve cloud worker organization context", orgResult.error);
    } else if (orgResult.value) {
      const org = orgResult.value;
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
  }

  const user = c.get("user");
  if (!user) {
    c.set("org", null);
    await next();
    return;
  }

  const membershipResult = await tryPromiseAllowFailure(() => getMembershipForUser(db, user.id));
  if (Result.isError(membershipResult)) {
    console.error("[org] failed to resolve organization context", membershipResult.error);
    c.set("org", null);
  } else {
    c.set("org", membershipResult.value);
  }

  await next();
}
