import { createDb } from "@openharness/db";
import { Result } from "better-result";
import { Hono } from "hono";
import { env } from "../env.js";
import { errorMessage, tryPromiseAllowFailure } from "../result-helpers.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import {
  connectAzureDevOpsOrg,
  disconnectAzureDevOpsOrg,
  handleAzureDevOpsWebhook,
  azureDevOpsSourceControlAdapter,
  findAdoRepoInOrg,
} from "./adapter.js";
import { parseAzureDevOpsRemoteUrl } from "./client.js";
import { provisionServiceHooks } from "./service-hooks.js";
import {
  deleteOrgRepoConnectionIfOrphaned,
  upsertOrgRepoConnection,
  upsertRunnerBinding,
} from "../github/runner-bindings-db.js";

const db = createDb(env.databaseUrl());

export const azureDevOpsRoutes = new Hono<{ Variables: AppVariables }>();

azureDevOpsRoutes.get("/status", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const statusResult = await tryPromiseAllowFailure(() =>
    azureDevOpsSourceControlAdapter.getStatus(org.organizationId),
  );
  if (Result.isError(statusResult)) {
    return c.json(
      { error: errorMessage(statusResult.error) || "Failed to load Azure DevOps status" },
      500,
    );
  }
  const status = statusResult.value;
  return c.json({
    configured: status.configured,
    connected: status.connected,
    loginComplete: true,
    agentReady: status.agentReady,
    connection: status.connections[0] ?? null,
  });
});

azureDevOpsRoutes.post("/connect", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    orgName?: string;
    pat?: string;
  } | null;

  if (!body?.orgName?.trim() || !body?.pat?.trim()) {
    return c.json({ error: "orgName and pat are required" }, 400);
  }

  const orgName = body.orgName.trim();
  const pat = body.pat.trim();

  const connectResult = await tryPromiseAllowFailure(() =>
    connectAzureDevOpsOrg(db, org.organizationId, user.id, orgName, pat),
  );
  if (Result.isError(connectResult)) {
    return c.json(
      { error: errorMessage(connectResult.error) || "Failed to connect Azure DevOps" },
      400,
    );
  }
  return c.json({ ok: true, ...connectResult.value });
});

azureDevOpsRoutes.post("/disconnect", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  await disconnectAzureDevOpsOrg(db, org.organizationId);
  return c.json({ ok: true });
});

azureDevOpsRoutes.get("/repos", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const q = c.req.query("q");
  const page = Number(c.req.query("page") ?? "1");
  const perPage = Number(c.req.query("perPage") ?? "50");

  const result = await azureDevOpsSourceControlAdapter.listAccessibleRepos(org.organizationId, {
    query: q,
    page,
    perPage,
  });

  return c.json({
    repos: result.repos.map((repo) => ({
      provider: repo.provider,
      githubRepoId: repo.externalRepoId,
      externalRepoId: repo.externalRepoId,
      owner: repo.namespace,
      namespace: repo.namespace,
      name: repo.name,
      fullName: repo.fullName,
      connectionId: repo.connectionId,
      installationId: repo.connectionId,
    })),
    total: result.total,
    page: result.page,
    perPage: result.perPage,
  });
});

azureDevOpsRoutes.get("/branches", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const project = c.req.query("project") ?? c.req.query("owner");
  const repo = c.req.query("repo");
  if (!project || !repo) {
    return c.json({ error: "project and repo are required" }, 400);
  }

  const branchesResult = await tryPromiseAllowFailure(() =>
    azureDevOpsSourceControlAdapter.listBranches(org.organizationId, project, repo),
  );
  if (Result.isError(branchesResult)) {
    return c.json(
      { error: errorMessage(branchesResult.error) || "Failed to list branches" },
      400,
    );
  }
  return c.json(branchesResult.value);
});

azureDevOpsRoutes.post("/connect-repo", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    projectPath?: string;
    runnerInstanceId?: string;
    project?: string;
    owner?: string;
    repo?: string;
    remoteUrl?: string | null;
  } | null;

  const namespace = body?.project ?? body?.owner;
  const repo = body?.repo;
  if (!namespace || !repo || !body?.projectPath || !body?.runnerInstanceId) {
    return c.json({ error: "projectPath, runnerInstanceId, project, and repo are required" }, 400);
  }

  const repoRecord = await findAdoRepoInOrg(org.organizationId, namespace, repo);
  if (!repoRecord) {
    return c.json({ error: "Repository is not accessible via the connected Azure DevOps org" }, 400);
  }

  const warning = (() => {
    const detected = parseAzureDevOpsRemoteUrl(body.remoteUrl ?? "");
    if (!detected) return null;
    if (
      detected.project.toLowerCase() === namespace.toLowerCase() &&
      detected.repo.toLowerCase() === repo.toLowerCase()
    ) {
      return null;
    }
    return `Local git origin points to ${detected.project}/${detected.repo}, but you linked ${namespace}/${repo}.`;
  })();

  const connectionId = await upsertOrgRepoConnection(db, org.organizationId, user.id, {
    provider: "azure_devops",
    owner: namespace,
    repo,
    externalRepoId: repoRecord.externalRepoId,
    connectionId: repoRecord.connectionId,
    remoteUrl: body.remoteUrl ?? null,
    metadata: { projectId: (repoRecord as { projectId?: string }).projectId },
  });

  await upsertRunnerBinding(db, org.organizationId, user.id, {
    runnerInstanceId: body.runnerInstanceId,
    connectionId,
    projectPath: body.projectPath,
  });

  await provisionServiceHooks(db, org.organizationId, connectionId);

  return c.json({
    connected: true,
    provider: "azure_devops",
    owner: namespace,
    namespace,
    repo,
    fullName: `${namespace}/${repo}`,
    externalRepoId: repoRecord.externalRepoId,
    githubRepoId: repoRecord.externalRepoId,
    connectionId: repoRecord.connectionId,
    installationId: repoRecord.connectionId,
    remoteUrl: body.remoteUrl ?? null,
    warning,
  });
});

azureDevOpsRoutes.post("/disconnect-repo", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json().catch(() => null)) as {
    runnerInstanceId?: string;
    projectPath?: string;
  } | null;

  if (!body?.runnerInstanceId || !body?.projectPath) {
    return c.json({ error: "runnerInstanceId and projectPath are required" }, 400);
  }

  const { deleteRunnerBindingByPath } = await import("../github/runner-bindings-db.js");
  const result = await deleteRunnerBindingByPath(
    db,
    org.organizationId,
    body.runnerInstanceId,
    body.projectPath,
  );

  if (result.connectionId) {
    await deleteOrgRepoConnectionIfOrphaned(db, org.organizationId, result.connectionId);
  }

  return c.json({ ok: true });
});

azureDevOpsRoutes.post("/webhook", async (c) => {
  const body = await c.req.text();
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of c.req.raw.headers.entries()) {
    headers[key.toLowerCase()] = value;
  }
  return handleAzureDevOpsWebhook(body, headers);
});

export function adoRemoteMismatchWarning(
  detectedRemoteUrl: string | null | undefined,
  project: string,
  repo: string,
): string | null {
  const detected = parseAzureDevOpsRemoteUrl(detectedRemoteUrl ?? "");
  if (!detected) return null;
  if (
    detected.project.toLowerCase() === project.toLowerCase() &&
    detected.repo.toLowerCase() === repo.toLowerCase()
  ) {
    return null;
  }
  return `Local git origin points to ${detected.project}/${detected.repo}, but you linked ${project}/${repo}.`;
}
