import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { projectGithubConnection } from "@openharness/db/schema";
import type { AuthSession } from "../auth.js";
import { env, hasGithubApp } from "../env.js";
import { createInstallState, verifyInstallState } from "./install-state.js";
import {
  fetchInstallationFromGithub,
  findRepoInUserInstallations,
  getProjectConnection,
  getUserInstallations,
  listUserAccessibleRepos,
  remoteMismatchWarning,
  syncInstallationRepos,
  upsertInstallationForUser,
} from "./sync.js";
import { handleGithubWebhook } from "./webhook.js";

type GithubVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

const db = createDb(env.databaseUrl());

function requireUser(c: { get: (key: "user") => AuthSession["user"] | null }) {
  const user = c.get("user");
  if (!user) {
    return null;
  }
  return user;
}

export const githubRoutes = new Hono<{ Variables: GithubVariables }>();

githubRoutes.get("/status", async (c) => {
  const user = requireUser(c);
  if (!user) {
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

  const installations = await getUserInstallations(db, user.id);
  const agentReady = installations.some((inst) => inst.repoCount > 0);

  return c.json({
    configured: true,
    loginComplete: true,
    agentReady,
    installations,
  });
});

githubRoutes.get("/install-url", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!hasGithubApp()) {
    return c.json({ error: "GitHub App is not configured" }, 503);
  }

  const slug = env.githubAppSlug();
  const state = createInstallState(user.id);
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

  try {
    const installation = await fetchInstallationFromGithub(installationId);
    await upsertInstallationForUser(db, verified.userId, installation);
    await syncInstallationRepos(db, installationId);
    return c.html(
      installResultPage(
        true,
        "GitHub App connected. Return to OpenHarness — your installations will refresh automatically.",
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to register installation";
    return c.html(installResultPage(false, message));
  }
});

githubRoutes.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");
  const result = await handleGithubWebhook(db, rawBody, signature);
  if (!result.ok) {
    const status = result.status === 401 ? 401 : 400;
    return c.json({ error: result.message }, status);
  }
  return c.json({ ok: true });
});

githubRoutes.get("/repos", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const query = c.req.query("q") ?? undefined;
  const page = Number.parseInt(c.req.query("page") ?? "1", 10) || 1;
  const result = await listUserAccessibleRepos(db, user.id, query, page);
  return c.json(result);
});

githubRoutes.get("/connection", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const projectPath = c.req.query("projectPath");
  if (!projectPath) {
    return c.json({ error: "projectPath is required" }, 400);
  }

  const connection = await getProjectConnection(db, user.id, projectPath);
  if (!connection) {
    return c.json({ connected: false });
  }

  return c.json({
    connected: true,
    owner: connection.githubOwner,
    repo: connection.githubRepo,
    fullName: `${connection.githubOwner}/${connection.githubRepo}`,
    githubRepoId: connection.githubRepoId,
    installationId: connection.installationId,
    remoteUrl: connection.remoteUrl,
  });
});

githubRoutes.post("/connection", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.projectPath !== "string" ||
    typeof body.owner !== "string" ||
    typeof body.repo !== "string"
  ) {
    return c.json({ error: "projectPath, owner, and repo are required" }, 400);
  }

  const remoteUrl = typeof body.remoteUrl === "string" ? body.remoteUrl : null;
  const repoRecord = await findRepoInUserInstallations(db, user.id, body.owner, body.repo);
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
  const existing = await getProjectConnection(db, user.id, body.projectPath);

  if (existing) {
    await db
      .update(projectGithubConnection)
      .set({
        githubOwner: body.owner,
        githubRepo: body.repo,
        githubRepoId: repoRecord.githubRepoId,
        installationId: repoRecord.installationId,
        remoteUrl,
        updatedAt: new Date(),
      })
      .where(eq(projectGithubConnection.id, existing.id));
  } else {
    await db.insert(projectGithubConnection).values({
      id: randomUUID(),
      userId: user.id,
      projectPath: body.projectPath,
      githubOwner: body.owner,
      githubRepo: body.repo,
      githubRepoId: repoRecord.githubRepoId,
      installationId: repoRecord.installationId,
      remoteUrl,
    });
  }

  return c.json({
    connected: true,
    owner: body.owner,
    repo: body.repo,
    fullName: `${body.owner}/${body.repo}`,
    githubRepoId: repoRecord.githubRepoId,
    installationId: repoRecord.installationId,
    remoteUrl,
    warning,
  });
});

githubRoutes.delete("/connection", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.projectPath !== "string") {
    return c.json({ error: "projectPath is required" }, 400);
  }

  await db
    .delete(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.userId, user.id),
        eq(projectGithubConnection.projectPath, body.projectPath),
      ),
    );

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
