import { and, createDb, eq } from "@openharness/db";
import { Hono } from "hono";
import { projectSourceControlConnection, workflow } from "@openharness/db/schema";
import { env } from "../env.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import { findRepoInOrgInstallations, remoteMismatchWarning } from "./sync.js";
import { upsertOrgRepoConnection } from "./runner-bindings-db.js";
import {
  canMutateWorkflow,
  createOrgWorkflow,
  deleteOrgWorkflow,
  getOrgWorkflow,
  listOrgWorkflows,
  updateOrgWorkflow,
} from "./workflow-db.js";
import { WORKFLOW_TEMPLATES } from "./workflow-constants.js";
import {
  DEFAULT_WORKFLOW_TOOLS,
  isWorkflowTools,
  isWorkflowTrigger,
  type WorkflowTools,
  type WorkflowTrigger,
} from "./workflow-types.js";
import { validateScheduleTrigger } from "./workflow-cron.js";
import { enqueueManualWorkflowRun } from "./workflow-manual-run.js";

const db = createDb(env.databaseUrl());

async function resolveConnectionId(
  organizationId: string,
  userId: string,
  body: {
    connectionId?: string;
    owner?: string;
    repo?: string;
    remoteUrl?: string | null;
  },
): Promise<{ connectionId: string; owner: string; repo: string; remoteUrl: string | null } | null> {
  if (typeof body.connectionId === "string" && body.connectionId.trim()) {
    const rows = await db
      .select()
      .from(projectSourceControlConnection)
      .where(
        eq(projectSourceControlConnection.id, body.connectionId),
      )
      .limit(1);
    const connection = rows[0];
    if (!connection || connection.organizationId !== organizationId) return null;
    return {
      connectionId: connection.id,
      owner: connection.namespace,
      repo: connection.name,
      remoteUrl: connection.remoteUrl,
    };
  }

  if (typeof body.owner !== "string" || typeof body.repo !== "string") {
    return null;
  }

  const remoteUrl = typeof body.remoteUrl === "string" ? body.remoteUrl : null;
  const repoRecord = await findRepoInOrgInstallations(
    db,
    organizationId,
    body.owner,
    body.repo,
  );
  if (!repoRecord) return null;

  const connectionId = await upsertOrgRepoConnection(db, organizationId, userId, {
    provider: "github",
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
    externalRepoId: repoRecord.githubRepoId,
    connectionId: repoRecord.connectionId,
    installationId: repoRecord.installationId,
  });

  return {
    connectionId,
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
  };
}

function parseTriggers(value: unknown): WorkflowTrigger[] | null {
  if (!Array.isArray(value)) return null;
  const triggers = value.filter(isWorkflowTrigger);
  if (triggers.length !== value.length) return null;
  for (const trigger of triggers) {
    if (trigger.kind === "schedule") {
      const result = validateScheduleTrigger(trigger);
      if (!result.ok) return null;
    }
  }
  return triggers;
}

function parseTools(value: unknown): WorkflowTools | null {
  return isWorkflowTools(value) ? value : null;
}

async function getWorkflowAccessRow(organizationId: string, workflowId: string) {
  const rows = await db
    .select({
      localOnly: workflow.localOnly,
      userId: workflow.userId,
    })
    .from(workflow)
    .where(and(eq(workflow.organizationId, organizationId), eq(workflow.id, workflowId)))
    .limit(1);
  return rows[0] ?? null;
}

export const workflowConfigRoutes = new Hono<{ Variables: AppVariables }>();

workflowConfigRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const workflows = await listOrgWorkflows(db, org.organizationId, user.id);
  return c.json({ templates: WORKFLOW_TEMPLATES, workflows });
});

workflowConfigRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const workflowRecord = await getOrgWorkflow(db, org.organizationId, c.req.param("id"), user.id);
  if (!workflowRecord) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ workflow: workflowRecord });
});

workflowConfigRoutes.post("/", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid body" }, 400);

  const resolved = await resolveConnectionId(org.organizationId, user.id, body);
  if (!resolved) {
    const hasRepo =
      typeof body.owner === "string" &&
      typeof body.repo === "string";
    if (hasRepo) {
      return c.json(
        {
          error: "repo_not_accessible",
          message: "Install the OpenHarness GitHub App on this repository first.",
        },
        403,
      );
    }
    return c.json({ error: "connectionId or owner and repo are required" }, 400);
  }

  const triggers = body.triggers ? parseTriggers(body.triggers) : [];
  const tools = body.tools ? parseTools(body.tools) : DEFAULT_WORKFLOW_TOOLS;
  if (body.triggers && !triggers) return c.json({ error: "Invalid triggers" }, 400);
  if (body.tools && !tools) return c.json({ error: "Invalid tools" }, 400);

  const targetBranch =
    typeof body.targetBranch === "string" ? body.targetBranch.trim() : "";
  if (!targetBranch) return c.json({ error: "targetBranch is required" }, 400);

  const workflowRecord = await createOrgWorkflow(db, org.organizationId, user.id, {
    connectionId: resolved.connectionId,
    name: typeof body.name === "string" ? body.name : "Untitled",
    enabled: body.enabled === true,
    localOnly: body.localOnly === true,
    model: typeof body.model === "string" ? body.model : "",
    instructions: typeof body.instructions === "string" ? body.instructions : "",
    targetBranch,
    triggers: triggers ?? [],
    tools: tools ?? DEFAULT_WORKFLOW_TOOLS,
  });

  const warning = remoteMismatchWarning(resolved.remoteUrl, resolved.owner, resolved.repo);
  return c.json({ ok: true, warning, workflow: workflowRecord });
});

workflowConfigRoutes.put("/:id", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid body" }, 400);

  let connectionId: string | undefined;
  if (
    typeof body.connectionId === "string" ||
    (typeof body.owner === "string" && typeof body.repo === "string")
  ) {
    const resolved = await resolveConnectionId(org.organizationId, user.id, body);
    if (!resolved) {
      return c.json({ error: "repo_not_accessible" }, 403);
    }
    connectionId = resolved.connectionId;
  }

  const triggers = body.triggers !== undefined ? parseTriggers(body.triggers) : undefined;
  const tools = body.tools !== undefined ? parseTools(body.tools) : undefined;
  if (body.triggers !== undefined && triggers === null) return c.json({ error: "Invalid triggers" }, 400);
  if (body.tools !== undefined && tools === null) return c.json({ error: "Invalid tools" }, 400);

  const targetBranch =
    body.targetBranch !== undefined
      ? typeof body.targetBranch === "string"
        ? body.targetBranch.trim()
        : ""
      : undefined;
  if (targetBranch !== undefined && !targetBranch) {
    return c.json({ error: "targetBranch is required" }, 400);
  }

  const access = await getWorkflowAccessRow(org.organizationId, workflowId);
  if (!access) return c.json({ error: "Workflow not found" }, 404);
  if (!canMutateWorkflow(access, user.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const updated = await updateOrgWorkflow(db, org.organizationId, workflowId, {
    connectionId,
    name: typeof body.name === "string" ? body.name : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    localOnly: typeof body.localOnly === "boolean" ? body.localOnly : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    instructions: typeof body.instructions === "string" ? body.instructions : undefined,
    targetBranch,
    triggers: triggers ?? undefined,
    tools: tools ?? undefined,
  }, user.id);

  if (!updated) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ ok: true, workflow: updated });
});

workflowConfigRoutes.post("/:id/run", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.param("id");
  const access = await getWorkflowAccessRow(org.organizationId, workflowId);
  if (!access) return c.json({ error: "Workflow not found" }, 404);
  if (!canMutateWorkflow(access, user.id)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const result = await enqueueManualWorkflowRun(db, org.organizationId, workflowId, user.id);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json({ ok: true, runId: result.runId });
});

workflowConfigRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const deleted = await deleteOrgWorkflow(db, org.organizationId, c.req.param("id"), user.id);
  if (!deleted) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ ok: true });
});
