import { createDb } from "@openharness/db";
import { Result } from "better-result";
import { Hono, type Context } from "hono";
import { env, hasLinearOAuth } from "../env.js";
import { createInstallState, verifyInstallState } from "../github/install-state.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import { isOrgAdmin } from "../org/org-db.js";
import { isCloudInfraConfigured } from "../cloud-worker/resolve-executor.js";
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
  linearGrantedScopesIncludeAgent,
} from "./linear-oauth.js";
import {
  getLinearAgentRunById,
  getLinearAgentRunForOrg,
  listLinearAgentConfigsForOrg,
  listRecentLinearAgentSessions,
  orgCloudWorkersAvailable,
  upsertLinearAgentConfig,
} from "./linear-agent-db.js";
import { isLinearAgentSessionEvent } from "./linear-agent-webhook-payload.js";
import { handleLinearAgentWebhookEvent } from "./workflow-linear-agent-webhook.js";
import { assertLinearToolAllowed } from "./linear-tool-auth.js";
import { requireLinearConnected } from "./linear-token.js";
import {
  resolveLinearWebhookSecret,
  validateLinearWebhookAuth,
} from "./linear-webhook-verify.js";
import { handleLinearWebhookEvent } from "./workflow-linear-webhook.js";
import {
  bestEffortAsync,
  jsonFromHttpResult,
  parseJson,
  tryHttpPromise,
  tryPromiseAllowFailure,
} from "../result-helpers.js";

const db = createDb(env.databaseUrl());

export const linearRoutes = new Hono<{ Variables: AppVariables }>();

function linearResultPage(success: boolean, message: string): string {
  const title = success ? "Linear connected" : "Linear connection failed";
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1 style="color:${color}">${title}</h1><p>${message}</p><p>You can close this window and return to OpenHarness.</p></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function linearAgentRunViewPage(run: {
  id: string;
  status: string;
  trigger: string;
  namespace: string;
  repoName: string;
  payload: Record<string, unknown>;
  errorMessage: string | null;
  resultMarkdown: string | null;
  createdAt: string;
  updatedAt: string;
}): string {
  const issueIdentifier =
    typeof run.payload.issueIdentifier === "string" ? run.payload.issueIdentifier : null;
  const issueTitle = typeof run.payload.issueTitle === "string" ? run.payload.issueTitle : null;
  const statusColor =
    run.status === "done"
      ? "#16a34a"
      : run.status === "failed"
        ? "#dc2626"
        : run.status === "running" || run.status === "claimed"
          ? "#2563eb"
          : "#64748b";

  const summaryBlock =
    run.status === "failed" && run.errorMessage
      ? `<section style="margin-top:1.5rem"><h2 style="font-size:1rem;margin:0 0 .5rem">Error</h2><pre style="white-space:pre-wrap;background:#fef2f2;padding:1rem;border-radius:.5rem">${escapeHtml(run.errorMessage)}</pre></section>`
      : run.status === "done" && run.resultMarkdown
        ? `<section style="margin-top:1.5rem"><h2 style="font-size:1rem;margin:0 0 .5rem">Result</h2><pre style="white-space:pre-wrap;background:#f8fafc;padding:1rem;border-radius:.5rem">${escapeHtml(run.resultMarkdown)}</pre></section>`
        : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>OpenHarness Linear agent run</title></head><body style="font-family:system-ui;padding:2rem;max-width:40rem;margin:auto;color:#0f172a"><h1 style="margin:0 0 .5rem">OpenHarness Linear agent run</h1><p style="color:#64748b;margin:0 0 1.5rem">Read-only status for run <code>${escapeHtml(run.id)}</code></p><dl style="display:grid;grid-template-columns:8rem 1fr;gap:.5rem 1rem;margin:0"><dt>Status</dt><dd style="margin:0;color:${statusColor};font-weight:600">${escapeHtml(run.status)}</dd><dt>Trigger</dt><dd style="margin:0">${escapeHtml(run.trigger)}</dd>${issueIdentifier ? `<dt>Issue</dt><dd style="margin:0">${escapeHtml(issueIdentifier)}${issueTitle ? `: ${escapeHtml(issueTitle)}` : ""}</dd>` : ""}<dt>Repository</dt><dd style="margin:0">${escapeHtml(`${run.namespace}/${run.repoName}`)}</dd><dt>Started</dt><dd style="margin:0">${escapeHtml(run.createdAt)}</dd><dt>Updated</dt><dd style="margin:0">${escapeHtml(run.updatedAt)}</dd></dl>${summaryBlock}</body></html>`;
}

function parseJsonBody<T>(body: unknown): T {
  return body as T;
}

function workflowRunIdFromRequest(c: { req: { header: (name: string) => string | undefined } }): string | null {
  return c.req.header("x-workflow-run-id")?.trim() || null;
}

function linearAgentRunIdFromRequest(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  return c.req.header("x-linear-agent-run-id")?.trim() || null;
}

function requireOrgAdmin(c: Context<{ Variables: AppVariables }>) {
  const org = requireOrg(c);
  if (!org) return null;
  if (!isOrgAdmin(org.role)) return null;
  return org;
}

async function withLinearTool<T>(
  c: Context<{ Variables: AppVariables }>,
  toolName: string,
  handler: (accessToken: string) => Promise<T>,
): Promise<Response> {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const result = await tryHttpPromise(
    async () => {
      const workflowRunId = workflowRunIdFromRequest(c);
      const linearAgentRunId = linearAgentRunIdFromRequest(c);
      await assertLinearToolAllowed(db, org.organizationId, toolName, workflowRunId, linearAgentRunId);
      const { accessToken } = await requireLinearConnected(db, org.organizationId);
      return handler(accessToken);
    },
    { message: "Linear request failed", status: 400 },
  );
  return jsonFromHttpResult(c, result);
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
      agentReady: false,
      cloudWorkersEnabled: false,
      cloudInfraConfigured: false,
    });
  }

  const installation = await getLinearInstallationForOrg(db, org.organizationId);
  const mappings = await listLinearMappingsForOrg(db, org.organizationId);
  const cloudWorkersEnabled = await orgCloudWorkersAvailable(db, org.organizationId);

  return c.json({
    configured: true,
    connected: Boolean(installation),
    installation,
    mappings,
    agentReady: linearGrantedScopesIncludeAgent(installation?.grantedScopes),
    cloudWorkersEnabled,
    cloudInfraConfigured: isCloudInfraConfigured(),
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

  const connectResult = await tryHttpPromise(
    async () => {
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
        await bestEffortAsync("[linear-oauth] previous webhook delete", async () => {
          await deleteLinearWebhook(token.access_token, existing.webhookId!);
        });
      }

      const apiBase = env.betterAuthUrl().replace(/\/$/, "");
      const webhookUrl = `${apiBase}/api/linear/webhook`;
      let webhookId: string | null = null;
      let webhookSecret: string | null = env.linearWebhookSecret() ?? null;
      const webhookResult = await tryPromiseAllowFailure(async () =>
        createLinearWebhook(token.access_token, webhookUrl),
      );
      if (Result.isOk(webhookResult)) {
        webhookId = webhookResult.value.id;
        webhookSecret = webhookResult.value.secret ?? webhookSecret;
      } else {
        console.warn(
          "[linear-oauth] webhookCreate failed; enable Webhooks on the Linear OAuth app or set LINEAR_WEBHOOK_SECRET",
          webhookResult.error,
        );
      }

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
        webhookId,
        webhookSecret,
        grantedScopes: token.scope ?? null,
      });

      return { workspaceName, webhookId };
    },
    { message: "Failed to connect Linear", status: 400 },
  );

  if (Result.isError(connectResult)) {
    return c.html(linearResultPage(false, connectResult.error.message));
  }

  const { workspaceName, webhookId } = connectResult.value;
  const webhookNote = webhookId
    ? ""
    : " Workflow triggers need webhooks enabled on your Linear OAuth app (URL above) or LINEAR_WEBHOOK_SECRET on the API.";

  return c.html(
    linearResultPage(
      true,
      `Connected to ${workspaceName}. Return to OpenHarness to map Linear projects to repositories.${webhookNote}`,
    ),
  );
});

linearRoutes.delete("/installation", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const installation = await getLinearInstallationWithTokens(db, org.organizationId);
  if (installation?.webhookId) {
    await bestEffortAsync("[linear] installation webhook delete", async () => {
      const accessToken = await requireLinearConnected(db, org.organizationId);
      await deleteLinearWebhook(accessToken.accessToken, installation.webhookId!);
    });
  }

  await deleteLinearInstallation(db, org.organizationId);
  return c.json({ ok: true });
});

linearRoutes.get("/projects", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const result = await tryHttpPromise(
    async () => {
      const { accessToken } = await requireLinearConnected(db, org.organizationId);
      const projects = await listLinearProjects(accessToken);
      return { projects };
    },
    { message: "Failed to list Linear projects", status: 400 },
  );
  return jsonFromHttpResult(c, result);
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
  const signature =
    c.req.header("linear-signature") ?? c.req.header("Linear-Signature") ?? undefined;
  const deliveryId = c.req.header("linear-delivery") ?? c.req.header("Linear-Delivery") ?? null;

  const parsedPayload = parseJson(rawBody);
  if (Result.isError(parsedPayload)) {
    return c.json({ error: parsedPayload.error.message }, 400);
  }
  const payload = parsedPayload.value as Record<string, unknown>;

  const webhookId = typeof payload.webhookId === "string" ? payload.webhookId : null;
  const organizationId =
    typeof payload.organizationId === "string" ? payload.organizationId : null;

  const installationByWebhookId = webhookId
    ? await getLinearInstallationByWebhookId(db, webhookId)
    : null;
  const installationByWorkspace =
    organizationId && !installationByWebhookId
      ? await getLinearInstallationByWorkspaceId(db, organizationId)
      : null;
  const installation = installationByWebhookId ?? installationByWorkspace;

  const webhookSecret = resolveLinearWebhookSecret({
    envSecret: env.linearWebhookSecret() ?? null,
    payloadWebhookId: webhookId,
    installation: installation
      ? {
          webhookId: installation.webhookId,
          webhookSecret: installation.webhookSecret,
        }
      : null,
  });

  const authFailure = validateLinearWebhookAuth({
    rawBody,
    signatureHeader: signature,
    webhookTimestamp: payload.webhookTimestamp,
    secret: webhookSecret,
  });
  if (authFailure) {
    console.warn("[linear-webhook] rejected", {
      reason: authFailure,
      webhookId,
      organizationId,
      deliveryId,
      hasEnvSecret: Boolean(env.linearWebhookSecret()),
      hasInstallationSecret: Boolean(installation?.webhookSecret),
    });
    const message =
      authFailure === "missing_signature"
        ? "Missing signature"
        : authFailure === "invalid_signature"
          ? "Invalid signature"
          : "Stale webhook";
    return c.json({ error: message }, 401);
  }

  const handlerResult = await tryHttpPromise(
    async () => {
      if (isLinearAgentSessionEvent(payload)) {
        await handleLinearAgentWebhookEvent(db, {
          payload,
          deliveryId,
        });
      } else {
        await handleLinearWebhookEvent(db, {
          payload,
          deliveryId,
        });
      }
    },
    { message: "Handler failed", status: 500 },
  );
  if (Result.isError(handlerResult)) {
    console.error("[linear-webhook] handler failed", handlerResult.error);
    return c.json({ error: handlerResult.error.message }, 500);
  }

  return c.json({ ok: true });
});

linearRoutes.get("/agent-configs", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const configs = await listLinearAgentConfigsForOrg(db, org.organizationId);
  const cloudWorkersEnabled = await orgCloudWorkersAvailable(db, org.organizationId);
  return c.json({
    configs,
    agentReady: linearGrantedScopesIncludeAgent(
      (await getLinearInstallationForOrg(db, org.organizationId))?.grantedScopes,
    ),
    cloudWorkersEnabled,
    cloudInfraConfigured: isCloudInfraConfigured(),
  });
});

linearRoutes.put("/agent-configs/:mappingId", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const mappingId = c.req.param("mappingId");
  const body = parseJsonBody<{
    enabled?: boolean;
    model?: string;
    instructions?: string;
    targetBranch?: string;
    tools?: Record<string, boolean>;
  }>(await c.req.json().catch(() => ({})));

  const mappings = await listLinearMappingsForOrg(db, org.organizationId);
  if (!mappings.some((mapping) => mapping.id === mappingId)) {
    return c.json({ error: "Mapping not found" }, 404);
  }

  if (body.enabled) {
    const cloudWorkersEnabled = await orgCloudWorkersAvailable(db, org.organizationId);
    if (!cloudWorkersEnabled || !isCloudInfraConfigured()) {
      return c.json(
        { error: "Cloud workers must be enabled and configured before enabling a Linear agent." },
        400,
      );
    }
    if (
      !linearGrantedScopesIncludeAgent(
        (await getLinearInstallationForOrg(db, org.organizationId))?.grantedScopes,
      )
    ) {
      return c.json(
        { error: "Reconnect Linear with agent scopes before enabling the Linear agent." },
        400,
      );
    }
  }

  const config = await upsertLinearAgentConfig(db, {
    organizationId: org.organizationId,
    mappingId,
    enabled: body.enabled,
    model: body.model,
    instructions: body.instructions,
    targetBranch: body.targetBranch,
    tools: body.tools as import("@openharness/shared/workflow-run").WorkflowTools | undefined,
  });

  return c.json({ config });
});

linearRoutes.get("/agent-sessions", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const sessions = await listRecentLinearAgentSessions(db, org.organizationId);
  return c.json({ sessions });
});

linearRoutes.get("/agent-runs/:runId/view", async (c) => {
  const run = await getLinearAgentRunById(db, c.req.param("runId"));
  if (!run) return c.text("Not found", 404);
  return c.html(linearAgentRunViewPage(run));
});

linearRoutes.get("/agent-runs/:runId", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const run = await getLinearAgentRunForOrg(db, org.organizationId, c.req.param("runId"));
  if (!run) return c.json({ error: "Not found" }, 404);
  return c.json({ run });
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
