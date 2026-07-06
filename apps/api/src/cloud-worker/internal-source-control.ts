import { Hono } from "hono";
import { Result } from "better-result";
import { createDb } from "@openharness/db";
import { env } from "../env.js";
import { getCloudWorkerOrgContext } from "../org/org-db.js";
import { getSourceControlProvider } from "../source-control/registry.js";
import { requireCloudWorkerAuth } from "./internal-auth.js";

const db = createDb(env.databaseUrl());

export const cloudWorkerInternalSourceControlRoutes = new Hono();

cloudWorkerInternalSourceControlRoutes.get(
  "/pr/:provider/:namespace/:repo/git-credentials",
  async (c) => {
    if (!requireCloudWorkerAuth(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (c.req.param("provider") !== "github") {
      return c.json({ error: "Invalid route parameters" }, 400);
    }

    const namespace = c.req.param("namespace")?.trim();
    const repo = c.req.param("repo")?.trim();
    const organizationId = c.req.query("organizationId")?.trim();
    if (!namespace || !repo || !organizationId) {
      return c.json({ error: "organizationId query parameter is required" }, 400);
    }

    const org = await getCloudWorkerOrgContext(db, organizationId);
    if (!org) {
      return c.json({ error: "Organization not found or cloud workers disabled" }, 404);
    }

    const adapter = getSourceControlProvider("github");
    const result = await adapter.fetchGitCredentials(org.id, namespace, repo);
    if (Result.isError(result)) {
      return c.json({ error: result.error.message }, 403);
    }
    return c.json(result.value);
  },
);

cloudWorkerInternalSourceControlRoutes.get(
  "/pr/:provider/:namespace/:repo/:number/context",
  async (c) => {
    if (!requireCloudWorkerAuth(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (c.req.param("provider") !== "github") {
      return c.json({ error: "Invalid route parameters" }, 400);
    }

    const namespace = c.req.param("namespace")?.trim();
    const repo = c.req.param("repo")?.trim();
    const organizationId = c.req.query("organizationId")?.trim();
    const number = Number.parseInt(c.req.param("number"), 10);
    if (!namespace || !repo || !organizationId || !Number.isFinite(number) || number <= 0) {
      return c.json({ error: "Invalid route parameters" }, 400);
    }

    const org = await getCloudWorkerOrgContext(db, organizationId);
    if (!org) {
      return c.json({ error: "Organization not found or cloud workers disabled" }, 404);
    }

    const adapter = getSourceControlProvider("github");
    const result = await adapter.fetchPrContext(org.id, namespace, repo, number);
    if (Result.isError(result)) {
      return c.json({ error: result.error.message }, 400);
    }
    return c.json(result.value);
  },
);
