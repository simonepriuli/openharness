import { createHmac, timingSafeEqual } from "node:crypto";
import { createDb } from "@openharness/db";
import { Hono, type Context } from "hono";
import { env, hasLinearOAuth } from "../env.js";
import { createInstallState, verifyInstallState } from "../github/install-state.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import {
  createLinearComment,
  createLinearIssue,
  createLinearWebhook,
  deleteLinearWebhook,
  assignLinearIssue,
  getLinearIssue,
  getLinearIssueByIdentifier,
  linkLinearIssue,
  listLinearComments,
  listLinearCycles,
  listLinearLabels,
  listLinearProjects,
  listLinearTeams,
  searchLinearIssues,
  updateLinearIssue,
  updateLinearIssueStatus,
} from "./linear-client.js";
import {
  deleteLinearInstallation,
  deleteLinearProjectMapping,
  getLinearInstallationByWebhookId,
  getLinearInstallationByWorkspaceId,
  getLinearInstallationForOrg,
  getLinearInstallationWithTokens,
  listLinearMappingsForOrg,
  upsertLinearInstallation,
  upsertLinearProjectRepoMapping,
} from "./linear-db.js";
import {
  buildLinearOAuthUrl,
  exchangeLinearCode,
  fetchLinearViewer,
} from "./linear-oauth.js";
import { assertLinearToolAllowed } from "./linear-tool-auth.js";
import { requireLinearConnected } from "./linear-token.js";
import { handleLinearWebhookEvent } from "./workflow-linear-webhook.js";

const db = createDb(env.databaseUrl());

export const linearRoutes = new Hono<{ Variables: AppVariables }>();

function linearResultPage(success: boolean, message: string): string {
  const title = success ? "Linear connected" : "Linear connection failed";
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1 style="color:${color}">${title}</h1><p>${message}</p><p>You can close this window and return to OpenHarness.</p></body></html>`;
}

function parseJsonBody<T>(body: unknown): T {
  return body as T;
}

function workflowRunIdFromRequest(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("x-workflow-run-id")?.trim() || null;
}

async function withLinearTool<T>(
  c: Context<{ Variables: AppVariables }>,
  toolName: string,
  handler: (accessToken: string) => Promise<T>,
): Promise<Response> {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  try {
    const workflowRunId = workflowRunIdFromRequest(c);
    await assertLinearToolAllowed(db, org.organizationId, toolName, workflowRunId);
    const { accessToken } = await requireLinearConnected(db, org.organizationId);
    const result = await handler(accessToken);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Linear request failed";
    return c.json({ error: message }, 400);
  }
}

linearRoutes.get("/status", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  if (!hasLinearOAuth()) {
    return c.json({
      configured: false,
      connected: false,
      installation: null,
      mappings: [],
    });
  }

  const installation = await getLinearInstallationForOrg(db, org.organizationId);
  const mappings = await listLinearMappingsForOrg(db, org.organizationId);

  return c.json({
    configured: true,
    connected: Boolean(installation),
    installation,
    mappings,
  });
});

linearRoutes.get("/connect-url", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  if (!hasLinearOAuth()) {
    return c.json({ error: "Linear OAuth is not configured" }, 503);
  }

  const state = createInstallState(user.id, org.organizationId);
  const url = buildLinearOAuthUrl({
    clientId: env.linearClientId()!,
    redirectUri: env.linearOAuthRedirectUri()!,
    state,
  });
  return c.json({ url });
});

linearRoutes.get("/oauth/callback", async (c) => {
  if (!hasLinearOAuth()) {
    return c.html(linearResultPage(false, "Linear OAuth is not configured on the server."));
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.html(linearResultPage(false, "Missing OAuth parameters from Linear."));
  }

  const verified = verifyInstallState(state);
  if (!verified) {
    return c.html(
      linearResultPage(false, "Connect link expired or invalid. Try again from OpenHarness."),
    );
  }

  try {
    const token = await exchangeLinearCode({
      clientId: env.linearClientId()!,
      clientSecret: env.linearClientSecret()!,
      redirectUri: env.linearOAuthRedirectUri()!,
      code,
    });

    const viewer = await fetchLinearViewer(token.access_token);
    const workspaceId = viewer.organization.id;
    const workspaceName = viewer.organization.name;

    const existing = await getLinearInstallationWithTokens(db, verified.organizationId);
    if (existing?.webhookId) {
      try {
        await deleteLinearWebhook(token.access_token, existing.webhookId);
      } catch {
        // Previous webhook may already be gone.
      }
    }

    const apiBase = env.betterAuthUrl().replace(/\/$/, "");
    const webhookUrl = `${apiBase}/api/linear/webhook`;
    const webhook = await createLinearWebhook(token.access_token, webhookUrl);

    await upsertLinearInstallation(db, {
      organizationId: verified.organizationId,
      userId: verified.userId,
      workspaceId,
      workspaceName,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      tokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      webhookId: webhook.id,
      webhookSecret: webhook.secret ?? env.linearWebhookSecret() ?? null,
    });

    return c.html(
      linearResultPage(
        true,
        `Connected to ${workspaceName}. Return to OpenHarness to map Linear projects to repositories.`,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect Linear";
    return c.html(linearResultPage(false, message));
  }
});

linearRoutes.delete("/installation", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const installation = await getLinearInstallationWithTokens(db, org.organizationId);
  if (installation?.webhookId) {
    try {
      const accessToken = await requireLinearConnected(db, org.organizationId);
      await deleteLinearWebhook(accessToken.accessToken, installation.webhookId);
    } catch {
      // Best effort cleanup.
    }
  }

  await deleteLinearInstallation(db, org.organizationId);
  return c.json({ ok: true });
});

linearRoutes.get("/projects", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  try {
    const { accessToken } = await requireLinearConnected(db, org.organizationId);
    const projects = await listLinearProjects(accessToken);
    return c.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list Linear projects";
    return c.json({ error: message }, 400);
  }
});

linearRoutes.get("/mappings", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);
  const mappings = await listLinearMappingsForOrg(db, org.organizationId);
  return c.json({ mappings });
});

linearRoutes.post("/mappings", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const body = parseJsonBody<{
    installationId?: string;
    projectId?: string;
    projectName?: string;
    provider?: string;
    namespace?: string;
    repoName?: string;
    projectSourceControlConnectionId?: string | null;
  }>(await c.req.json().catch(() => ({})));

  if (!body.projectId || !body.projectName || !body.provider || !body.namespace || !body.repoName) {
    return c.json({ error: "projectId, projectName, provider, namespace, and repoName are required" }, 400);
  }

  const installation =
    (body.installationId
      ? await getLinearInstallationForOrg(db, org.organizationId)
      : await getLinearInstallationForOrg(db, org.organizationId)) ??
    null;
  if (!installation || (body.installationId && installation.id !== body.installationId)) {
    return c.json({ error: "Linear is not connected" }, 400);
  }

  const mapping = await upsertLinearProjectRepoMapping(db, {
    organizationId: org.organizationId,
    userId: user.id,
    installationId: installation.id,
    projectId: body.projectId,
    projectName: body.projectName,
    provider: body.provider,
    namespace: body.namespace,
    repoName: body.repoName,
    projectSourceControlConnectionId: body.projectSourceControlConnectionId ?? null,
  });

  return c.json({ mapping });
});

linearRoutes.delete("/mappings/:mappingId", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const mappingId = c.req.param("mappingId");
  const deleted = await deleteLinearProjectMapping(db, org.organizationId, mappingId);
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

linearRoutes.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("linear-signature");
  const deliveryId = c.req.header("linear-delivery");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const webhookId = typeof payload.webhookId === "string" ? payload.webhookId : null;
  const organizationId =
    typeof payload.organizationId === "string" ? payload.organizationId : null;

  let webhookSecret = env.linearWebhookSecret() ?? null;
  if (webhookId) {
    const installation = await getLinearInstallationByWebhookId(db, webhookId);
    if (installation?.webhookSecret) {
      webhookSecret = installation.webhookSecret;
    } else if (organizationId) {
      const byWorkspace = await getLinearInstallationByWorkspaceId(db, organizationId);
      if (byWorkspace?.webhookSecret) {
        webhookSecret = byWorkspace.webhookSecret;
      }
    }
  }

  if (webhookSecret && signature) {
    const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  const timestamp = payload.webhookTimestamp;
  if (typeof timestamp === "number" && Math.abs(Date.now() - timestamp) > 60 * 1000) {
    return c.json({ error: "Stale webhook" }, 401);
  }

  try {
    await handleLinearWebhookEvent(db, {
      payload,
      deliveryId: deliveryId ?? null,
    });
  } catch (err) {
    console.error("[linear-webhook] handler failed", err);
    return c.json({ error: "Handler failed" }, 500);
  }

  return c.json({ ok: true });
});

// Tool proxy routes
linearRoutes.post("/tools/search-issues", async (c) =>
  withLinearTool(c, "search_linear_issues", async (accessToken) => {
    const body = parseJsonBody<{
      query?: string;
      teamId?: string;
      projectId?: string;
      limit?: number;
    }>(await c.req.json().catch(() => ({})));
    const issues = await searchLinearIssues(accessToken, body);
    return { issues };
  }),
);

linearRoutes.post("/tools/get-issue", async (c) =>
  withLinearTool(c, "get_linear_issue", async (accessToken) => {
    const body = parseJsonBody<{ issueId?: string; identifier?: string }>(
      await c.req.json().catch(() => ({})),
    );
    let issue = null;
    if (body.issueId) {
      issue = await getLinearIssue(accessToken, body.issueId);
    } else if (body.identifier) {
      issue = await getLinearIssueByIdentifier(accessToken, body.identifier);
    }
    if (!issue) return { issue: null };
    return { issue };
  }),
);

linearRoutes.get("/tools/projects", async (c) =>
  withLinearTool(c, "list_linear_projects", async (accessToken) => {
    const projects = await listLinearProjects(accessToken);
    return { projects };
  }),
);

linearRoutes.get("/tools/teams", async (c) =>
  withLinearTool(c, "list_linear_teams", async (accessToken) => {
    const teams = await listLinearTeams(accessToken);
    return { teams };
  }),
);

linearRoutes.get("/tools/cycles", async (c) =>
  withLinearTool(c, "list_linear_cycles", async (accessToken) => {
    const teamId = c.req.query("teamId") ?? undefined;
    const cycles = await listLinearCycles(accessToken, teamId);
    return { cycles };
  }),
);

linearRoutes.get("/tools/labels", async (c) =>
  withLinearTool(c, "list_linear_labels", async (accessToken) => {
    const teamId = c.req.query("teamId") ?? undefined;
    const labels = await listLinearLabels(accessToken, teamId);
    return { labels };
  }),
);

linearRoutes.post("/tools/issues", async (c) =>
  withLinearTool(c, "create_linear_issue", async (accessToken) => {
    const body = parseJsonBody<{
      teamId?: string;
      title?: string;
      description?: string;
      projectId?: string;
      priority?: number;
      labelIds?: string[];
      assigneeId?: string;
    }>(await c.req.json().catch(() => ({})));
    if (!body.teamId || !body.title) {
      throw new Error("teamId and title are required");
    }
    const issue = await createLinearIssue(accessToken, {
      teamId: body.teamId,
      title: body.title,
      description: body.description,
      projectId: body.projectId,
      priority: body.priority,
      labelIds: body.labelIds,
      assigneeId: body.assigneeId,
    });
    return { issue };
  }),
);

linearRoutes.patch("/tools/issues/:issueId", async (c) =>
  withLinearTool(c, "update_linear_issue", async (accessToken) => {
    const issueId = c.req.param("issueId");
    const body = parseJsonBody<{
      title?: string;
      description?: string;
      priority?: number;
      projectId?: string;
      labelIds?: string[];
    }>(await c.req.json().catch(() => ({})));
    const issue = await updateLinearIssue(accessToken, issueId, body);
    return { issue };
  }),
);

linearRoutes.post("/tools/issues/:issueId/assign", async (c) =>
  withLinearTool(c, "assign_linear_issue", async (accessToken) => {
    const issueId = c.req.param("issueId");
    const body = parseJsonBody<{ assigneeId?: string | null }>(
      await c.req.json().catch(() => ({})),
    );
    const issue = await assignLinearIssue(accessToken, issueId, body.assigneeId ?? null);
    return { issue };
  }),
);

linearRoutes.post("/tools/issues/:issueId/status", async (c) =>
  withLinearTool(c, "update_linear_issue_status", async (accessToken) => {
    const issueId = c.req.param("issueId");
    const body = parseJsonBody<{ stateId?: string }>(await c.req.json().catch(() => ({})));
    if (!body.stateId) throw new Error("stateId is required");
    const issue = await updateLinearIssueStatus(accessToken, issueId, body.stateId);
    return { issue };
  }),
);

linearRoutes.post("/tools/issues/:issueId/link", async (c) =>
  withLinearTool(c, "link_linear_issue", async (accessToken) => {
    const issueId = c.req.param("issueId");
    const body = parseJsonBody<{ url?: string; title?: string }>(
      await c.req.json().catch(() => ({})),
    );
    if (!body.url) throw new Error("url is required");
    const attachment = await linkLinearIssue(accessToken, issueId, body.url, body.title);
    return { attachment };
  }),
);

linearRoutes.get("/tools/issues/:issueId/comments", async (c) =>
  withLinearTool(c, "list_linear_comments", async (accessToken) => {
    const issueId = c.req.param("issueId");
    const comments = await listLinearComments(accessToken, issueId);
    return { comments };
  }),
);

linearRoutes.post("/tools/issues/:issueId/comments", async (c) =>
  withLinearTool(c, "create_linear_comment", async (accessToken) => {
    const issueId = c.req.param("issueId");
    const body = parseJsonBody<{ body?: string }>(await c.req.json().catch(() => ({})));
    if (!body.body?.trim()) throw new Error("body is required");
    const comment = await createLinearComment(accessToken, issueId, body.body.trim());
    return { comment };
  }),
);
