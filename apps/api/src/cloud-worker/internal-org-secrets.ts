import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { getCloudWorkerOrgContext } from "../org/org-db.js";
import { resolveOrgSecrets } from "../org/org-secrets-db.js";
import { requireCloudWorkerAuth } from "./internal-auth.js";

const db = createDb(env.databaseUrl());

export const cloudWorkerInternalOrgSecretsRoutes = new Hono();

cloudWorkerInternalOrgSecretsRoutes.post("/resolve", async (c) => {
  if (!requireCloudWorkerAuth(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => null)) as { organizationId?: unknown } | null;
  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  if (!organizationId) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const org = await getCloudWorkerOrgContext(db, organizationId);
  if (!org) {
    return c.json({ error: "Organization not found or cloud workers disabled" }, 404);
  }

  const secrets = await resolveOrgSecrets(db, org.id);
  return c.json({ secrets });
});
