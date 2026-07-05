import { createDb } from "@openharness/db";
import { Result } from "better-result";
import { Hono } from "hono";
import { env, hasGithubApp } from "../env.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import { jsonFromHttpResultOk, tryHttpPromise } from "../result-helpers.js";
import { createInstallState, verifyInstallState } from "./install-state.js";
import { runnerBindingRoutes } from "./runner-bindings.js";
import {
  deleteOrgRepoConnectionIfOrphaned,
  deleteRunnerBindingByPath,
  getRunnerBindingByPath,
  listOrgRepoConnections,
  upsertOrgRepoConnection,
  upsertRunnerBinding,
} from "./runner-bindings-db.js";
import {
  fetchInstallationFromGithub,
  findRepoInOrgInstallations,
  getOrgInstallations,
  listOrgAccessibleRepos,
  listRepoBranches,
  remoteMismatchWarning,
  syncInstallationRepos,
  upsertInstallationForOrg,
} from "./sync.js";
import { handleGithubWebhook } from "./webhook.js";
import { workflowRunRoutes } from "./workflow-runs.js";
import { prActionRoutes, workflowSettingsRoutes } from "./pr-actions.js";
import { workflowConfigRoutes } from "./workflow-config.js";

const db = createDb(env.databaseUrl());

export const githubRoutes = new Hono<{ Variables: AppVariables }>();

githubRoutes.get("/status", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!hasGithubApp()) {
    return c.json({
      configured: false,
      loginComplete: true,
      agentReady: false,
      installations: [],
    });
  }

  const result = await tryHttpPromise(
    async () => {
      const installations = await getOrgInstallations(db, org.organizationId);
      const agentReady = installations.some((inst) => inst.repoCount > 0);
      return {
        configured: true,
        loginComplete: true,
        agentReady,
        installations,
      };
    },
    { message: "Failed to load GitHub status", status: 500 },
  );

  if (Result.isError(result)) {
    console.error("[github/status]", result.error.message);
  }

  return jsonFromHttpResultOk(c, result, (value) => value);
});

githubRoutes.get("/install-url", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!hasGithubApp()) {
    return c.json({ error: "GitHub App is not configured" }, 503);
  }

  const slug = env.githubAppSlug();
  const state = createInstallState(user.id, org.organizationId);
  const url = `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;

  return c.json({ url });
});

githubRoutes.get("/install/callback", async (c) => {
  if (!hasGithubApp()) {
    return c.html(installResultPage(false, "GitHub App is not configured on the server."));
  }

  const installationId = c.req.query("installation_id");
  const state = c.req.query("state");
  if (!installationId || !state) {
    return c.html(installResultPage(false, "Missing installation parameters from GitHub."));
  }

  const verified = verifyInstallState(state);
  if (!verified) {
    return c.html(installResultPage(false, "Install link expired or invalid. Try again from OpenHarness."));
  }

  const result = await tryHttpPromise(
    async () => {
      const installation = await fetchInstallationFromGithub(installationId);
      await upsertInstallationForOrg(
        db,
        verified.organizationId,
        verified.userId,
        installation,
      );
      await syncInstallationRepos(db, installationId);
    },
    { message: "Failed to register installation", status: 500 },
  );

  if (Result.isError(result)) {
    return c.html(installResultPage(false, result.error.message));
  }

  return c.html(
    installResultPage(
      true,
      "GitHub App connected. Return to OpenHarness — your installations will refresh automatically.",
    ),
  );
});

githubRoutes.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");
  const eventName = c.req.header("x-github-event") ?? undefined;
  const deliveryId = c.req.header("x-github-delivery") ?? undefined;
  const result = await handleGithubWebhook(db, rawBody, signature, eventName, deliveryId);
  if (!result.ok) {
    const status = result.status === 401 ? 401 : 400;
    return c.json({ error: result.message }, status);
  }
  return c.json({ ok: true });
});

githubRoutes.route("/workflow-runs", workflowRunRoutes);
githubRoutes.route("/runner-bindings", runnerBindingRoutes);
githubRoutes.route("/workflow-settings", workflowSettingsRoutes);
githubRoutes.route("/workflows", workflowConfigRoutes);
githubRoutes.route("/pr", prActionRoutes);

githubRoutes.get("/repos", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const query = c.req.query("q") ?? undefined;
  const page = Number.parseInt(c.req.query("page") ?? "1", 10) || 1;
  const result = await listOrgAccessibleRepos(db, org.organizationId, query, page);
  return c.json(result);
});

githubRoutes.get("/repos/:owner/:repo/branches", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const owner = c.req.param("owner");
  const repo = c.req.param("repo");
  if (!owner || !repo) {
    return c.json({ error: "owner and repo are required" }, 400);
  }

  const result = await tryHttpPromise(
    () => listRepoBranches(db, org.organizationId, owner, repo),
    { message: "Failed to list branches", status: 500 },
  );

  if (Result.isError(result)) {
    if (result.error.message === "repo_not_accessible") {
      return c.json({ error: "repo_not_accessible" }, 403);
    }
    console.error("[github/repos/branches]", result.error.message);
    return c.json({ error: result.error.message }, 500);
  }

  return c.json(result.value);
});

githubRoutes.get("/connections", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const connections = await listOrgRepoConnections(db, org.organizationId);
  return c.json({ connections });
});

githubRoutes.get("/connection", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const projectPath = c.req.query("projectPath");
  const runnerInstanceId = c.req.query("runnerInstanceId");
  if (!projectPath || !runnerInstanceId) {
    return c.json({ error: "projectPath and runnerInstanceId are required" }, 400);
  }

  const row = await getRunnerBindingByPath(
    db,
    org.organizationId,
    runnerInstanceId,
    projectPath,
  );
  if (!row) {
    return c.json({ connected: false });
  }

  return c.json({
    connected: true,
    connectionId: row.binding.projectSourceControlConnectionId,
    provider: row.provider,
    owner: row.owner,
    repo: row.repo,
    fullName: `${row.owner}/${row.repo}`,
    githubRepoId: row.githubRepoId,
    installationId: row.installationId,
    remoteUrl: row.remoteUrl,
    projectPath: row.binding.projectPath,
  });
});

githubRoutes.post("/connection", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.projectPath !== "string" ||
    typeof body.owner !== "string" ||
    typeof body.repo !== "string" ||
    typeof body.runnerInstanceId !== "string"
  ) {
    return c.json(
      { error: "projectPath, owner, repo, and runnerInstanceId are required" },
      400,
    );
  }

  const remoteUrl = typeof body.remoteUrl === "string" ? body.remoteUrl : null;
  const repoRecord = await findRepoInOrgInstallations(
    db,
    org.organizationId,
    body.owner,
    body.repo,
  );
  if (!repoRecord) {
    return c.json(
      {
        error: "repo_not_accessible",
        message: "Install the OpenHarness GitHub App on this repository first.",
      },
      403,
    );
  }

  const warning = remoteMismatchWarning(remoteUrl, body.owner, body.repo);
  const connectionId = await upsertOrgRepoConnection(db, org.organizationId, user.id, {
    provider: "github",
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
    externalRepoId: repoRecord.githubRepoId,
    connectionId: repoRecord.connectionId,
    installationId: repoRecord.installationId,
  });

  const binding = await upsertRunnerBinding(db, org.organizationId, user.id, {
    runnerInstanceId: body.runnerInstanceId.trim(),
    connectionId,
    projectPath: body.projectPath,
    label: typeof body.label === "string" ? body.label : null,
  });

  return c.json({
    connected: true,
    connectionId,
    owner: body.owner,
    repo: body.repo,
    fullName: `${body.owner}/${body.repo}`,
    githubRepoId: repoRecord.githubRepoId,
    installationId: repoRecord.installationId,
    remoteUrl,
    projectPath: binding.projectPath,
    warning,
  });
});

githubRoutes.delete("/connection", async (c) => {
  const org = requireOrg(c);
  if (!org) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.projectPath !== "string" ||
    typeof body.runnerInstanceId !== "string"
  ) {
    return c.json({ error: "projectPath and runnerInstanceId are required" }, 400);
  }

  const result = await deleteRunnerBindingByPath(
    db,
    org.organizationId,
    body.runnerInstanceId.trim(),
    body.projectPath,
  );

  if (result.connectionId) {
    await deleteOrgRepoConnectionIfOrphaned(db, org.organizationId, result.connectionId);
  }

  return c.json({ ok: true });
});

function installResultPage(success: boolean, message: string): string {
  const title = success ? "GitHub App connected" : "GitHub App setup failed";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
      .ok { color: #047857; }
      .err { color: #b91c1c; }
    </style>
  </head>
  <body>
    <h1 class="${success ? "ok" : "err"}">${title}</h1>
    <p>${message}</p>
  </body>
</html>`;
}
