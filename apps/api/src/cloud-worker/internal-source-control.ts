import { Hono } from "hono";
import { Result } from "better-result";
import { createDb } from "@openharness/db";
import { SourceControlError } from "../errors.js";
import { env } from "../env.js";
import { errorMessage, respondFromSourceControlResult } from "../result-helpers.js";
import { getCloudWorkerOrgContext } from "../org/org-db.js";
import { getSourceControlProvider } from "../source-control/registry.js";
import type { GitCredentials } from "../source-control/pr-context.js";
import { requireCloudWorkerAuth } from "./internal-auth.js";

const db = createDb(env.databaseUrl());

export const cloudWorkerInternalSourceControlRoutes = new Hono();

async function fetchGitCredentialsForCloudWorker(input: {
  organizationId: string;
  namespace: string;
  repo: string;
}): Promise<Result<GitCredentials, SourceControlError>> {
  const org = await getCloudWorkerOrgContext(db, input.organizationId);
  if (!org) {
    return Result.err(
      new SourceControlError({
        status: 404,
        message: "Organization not found or cloud workers disabled",
      }),
    );
  }

  return Result.tryPromise({
    try: () => getSourceControlProvider("github").fetchGitCredentials(org.id, input.namespace, input.repo),
    catch: (cause) =>
      new SourceControlError({
        status: 403,
        message: errorMessage(cause) || "Failed to fetch git credentials",
      }),
  });
}

async function fetchPrContextForCloudWorker(input: {
  organizationId: string;
  namespace: string;
  repo: string;
  number: number;
}): Promise<Result<Awaited<ReturnType<ReturnType<typeof getSourceControlProvider>["fetchPrContext"]>>, SourceControlError>> {
  const org = await getCloudWorkerOrgContext(db, input.organizationId);
  if (!org) {
    return Result.err(
      new SourceControlError({
        status: 404,
        message: "Organization not found or cloud workers disabled",
      }),
    );
  }

  return Result.tryPromise({
    try: () =>
      getSourceControlProvider("github").fetchPrContext(
        org.id,
        input.namespace,
        input.repo,
        input.number,
      ),
    catch: (cause) =>
      new SourceControlError({
        status: 400,
        message: errorMessage(cause) || "Failed to fetch PR context",
      }),
  });
}

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

    const result = await fetchGitCredentialsForCloudWorker({ organizationId, namespace, repo });
    return respondFromSourceControlResult(c, result);
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

    const result = await fetchPrContextForCloudWorker({
      organizationId,
      namespace,
      repo,
      number,
    });
    return respondFromSourceControlResult(c, result);
  },
);
