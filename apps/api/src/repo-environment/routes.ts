import { Hono } from "hono";
import { Result } from "better-result";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { isAuthorizedCronRequest } from "../cron-auth.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import {
  deleteRepoEnvironmentVariable,
  listRepoEnvironmentSummaries,
  listRepoEnvironmentVariables,
  resolveRepoEnvironmentVariables,
  upsertRepoEnvironmentVariable,
} from "./repo-environment-db.js";
import { respondFromRepoEnvironmentResultJson } from "../result-helpers.js";

const db = createDb(env.databaseUrl());

export const repoEnvironmentRoutes = new Hono<{ Variables: AppVariables }>();

repoEnvironmentRoutes.get("/", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const repos = await listRepoEnvironmentSummaries(db, org.organizationId);
  return c.json({ repos });
});

repoEnvironmentRoutes.get("/:connectionId/resolved", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const connectionId = c.req.param("connectionId");
  const result = await resolveRepoEnvironmentVariables(db, org.organizationId, connectionId);
  return respondFromRepoEnvironmentResultJson(c, Result.map(result, (vars) => ({ vars })));
});

repoEnvironmentRoutes.get("/:connectionId", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const connectionId = c.req.param("connectionId");
  const result = await listRepoEnvironmentVariables(db, org.organizationId, connectionId);
  return respondFromRepoEnvironmentResultJson(c, Result.map(result, (variables) => ({ variables })));
});

repoEnvironmentRoutes.put("/:connectionId/:key", async (c) => {
  const org = requireOrg(c);
  const user = requireUser(c);
  if (!org || !user) return c.json({ error: "Unauthorized" }, 401);

  const connectionId = c.req.param("connectionId");
  const key = decodeURIComponent(c.req.param("key"));
  const body = (await c.req.json().catch(() => null)) as {
    value?: unknown;
    isSecret?: unknown;
    description?: unknown;
  } | null;

  if (!body || typeof body.value !== "string") {
    return c.json({ error: "value is required" }, 400);
  }

  const result = await upsertRepoEnvironmentVariable(
    db,
    org.organizationId,
    user.id,
    connectionId,
    key,
    {
      value: body.value,
      isSecret: body.isSecret === true,
      description:
        typeof body.description === "string" ? body.description : null,
    },
  );
  return respondFromRepoEnvironmentResultJson(c, Result.map(result, (variable) => ({ variable })));
});

repoEnvironmentRoutes.delete("/:connectionId/:key", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const connectionId = c.req.param("connectionId");
  const key = decodeURIComponent(c.req.param("key"));

  const result = await deleteRepoEnvironmentVariable(
    db,
    org.organizationId,
    connectionId,
    key,
  );
  if (Result.isError(result)) {
    return respondFromRepoEnvironmentResultJson(c, result);
  }
  if (!result.value) {
    return c.json({ error: "Variable not found" }, 404);
  }
  return c.json({ ok: true });
});

export const repoEnvironmentInternalRoutes = new Hono();

repoEnvironmentInternalRoutes.post("/resolve", async (c) => {
  const cloudWorkerSecret = env.cloudWorkerSecret();
  if (!cloudWorkerSecret) {
    return c.json({ error: "CLOUD_WORKER_SECRET is not configured" }, 503);
  }

  if (!isAuthorizedCronRequest(c.req.header("authorization"), cloudWorkerSecret)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => null)) as {
    organizationId?: unknown;
    connectionId?: unknown;
  } | null;

  const organizationId =
    body && typeof body.organizationId === "string" ? body.organizationId.trim() : "";
  const connectionId =
    body && typeof body.connectionId === "string" ? body.connectionId.trim() : "";

  if (!organizationId || !connectionId) {
    return c.json({ error: "organizationId and connectionId are required" }, 400);
  }

  const result = await resolveRepoEnvironmentVariables(db, organizationId, connectionId);
  return respondFromRepoEnvironmentResultJson(c, Result.map(result, (vars) => ({ vars })));
});
