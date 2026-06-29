import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { isAuthorizedCronRequest } from "../cron-auth.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import {
  RepoEnvironmentError,
  deleteRepoEnvironmentVariable,
  listRepoEnvironmentSummaries,
  listRepoEnvironmentVariables,
  resolveRepoEnvironmentVariables,
  upsertRepoEnvironmentVariable,
} from "./repo-environment-db.js";

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
  try {
    const vars = await resolveRepoEnvironmentVariables(db, org.organizationId, connectionId);
    return c.json({ vars });
  } catch (err) {
    if (err instanceof RepoEnvironmentError && err.code === "CONNECTION_NOT_FOUND") {
      return c.json({ error: err.message }, 404);
    }
    throw err;
  }
});

repoEnvironmentRoutes.get("/:connectionId", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const connectionId = c.req.param("connectionId");
  try {
    const variables = await listRepoEnvironmentVariables(
      db,
      org.organizationId,
      connectionId,
    );
    return c.json({ variables });
  } catch (err) {
    if (err instanceof RepoEnvironmentError && err.code === "CONNECTION_NOT_FOUND") {
      return c.json({ error: err.message }, 404);
    }
    throw err;
  }
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

  try {
    const variable = await upsertRepoEnvironmentVariable(
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
    return c.json({ variable });
  } catch (err) {
    if (err instanceof RepoEnvironmentError) {
      const status =
        err.code === "CONNECTION_NOT_FOUND"
          ? 404
          : err.code === "INVALID_KEY" || err.code === "INVALID_VALUE"
            ? 400
            : 400;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
});

repoEnvironmentRoutes.delete("/:connectionId/:key", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const connectionId = c.req.param("connectionId");
  const key = decodeURIComponent(c.req.param("key"));

  try {
    const deleted = await deleteRepoEnvironmentVariable(
      db,
      org.organizationId,
      connectionId,
      key,
    );
    if (!deleted) {
      return c.json({ error: "Variable not found" }, 404);
    }
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof RepoEnvironmentError) {
      const status = err.code === "CONNECTION_NOT_FOUND" ? 404 : 400;
      return c.json({ error: err.message, code: err.code }, status);
    }
    throw err;
  }
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

  try {
    const vars = await resolveRepoEnvironmentVariables(db, organizationId, connectionId);
    return c.json({ vars });
  } catch (err) {
    if (err instanceof RepoEnvironmentError && err.code === "CONNECTION_NOT_FOUND") {
      return c.json({ error: err.message }, 404);
    }
    throw err;
  }
});
