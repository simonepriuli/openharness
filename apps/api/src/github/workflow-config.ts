import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "@openharness/db";
import { projectGithubConnection } from "@openharness/db/schema";
import type { AuthSession } from "../auth.js";
import { env } from "../env.js";
import { findRepoInUserInstallations, getProjectConnection, remoteMismatchWarning } from "./sync.js";
import {
  createUserWorkflow,
  deleteUserWorkflow,
  getUserWorkflow,
  listUserWorkflows,
  updateUserWorkflow,
} from "./workflow-db.js";
import { WORKFLOW_TEMPLATES } from "./workflow-constants.js";
import {
  DEFAULT_WORKFLOW_TOOLS,
  isWorkflowTools,
  isWorkflowTrigger,
  type WorkflowTools,
  type WorkflowTrigger,
} from "./workflow-types.js";
import { randomUUID } from "node:crypto";

type GithubVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

const db = createDb(env.databaseUrl());

function requireUser(c: { get: (key: "user") => AuthSession["user"] | null }) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

async function upsertProjectGithubConnection(
  userId: string,
  input: {
    projectPath: string;
    owner: string;
    repo: string;
    remoteUrl: string | null;
    githubRepoId: string;
    installationId: string;
  },
): Promise<string> {
  const existing = await getProjectConnection(db, userId, input.projectPath);
  if (existing) {
    await db
      .update(projectGithubConnection)
      .set({
        githubOwner: input.owner,
        githubRepo: input.repo,
        githubRepoId: input.githubRepoId,
        installationId: input.installationId,
        remoteUrl: input.remoteUrl,
        updatedAt: new Date(),
      })
      .where(eq(projectGithubConnection.id, existing.id));
    return existing.id;
  }

  const connectionId = randomUUID();
  await db.insert(projectGithubConnection).values({
    id: connectionId,
    userId,
    projectPath: input.projectPath,
    githubOwner: input.owner,
    githubRepo: input.repo,
    githubRepoId: input.githubRepoId,
    installationId: input.installationId,
    remoteUrl: input.remoteUrl,
  });
  return connectionId;
}

function parseTriggers(value: unknown): WorkflowTrigger[] | null {
  if (!Array.isArray(value)) return null;
  const triggers = value.filter(isWorkflowTrigger);
  return triggers.length === value.length ? triggers : null;
}

function parseTools(value: unknown): WorkflowTools | null {
  return isWorkflowTools(value) ? value : null;
}

export const workflowConfigRoutes = new Hono<{ Variables: GithubVariables }>();

workflowConfigRoutes.get("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workflows = await listUserWorkflows(db, user.id);
  return c.json({ templates: WORKFLOW_TEMPLATES, workflows });
});

workflowConfigRoutes.get("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workflowRecord = await getUserWorkflow(db, user.id, c.req.param("id"));
  if (!workflowRecord) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ workflow: workflowRecord });
});

workflowConfigRoutes.post("/", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

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

  const connectionId = await upsertProjectGithubConnection(user.id, {
    projectPath: body.projectPath,
    owner: body.owner,
    repo: body.repo,
    remoteUrl,
    githubRepoId: repoRecord.githubRepoId,
    installationId: repoRecord.installationId,
  });

  const triggers = body.triggers ? parseTriggers(body.triggers) : [];
  const tools = body.tools ? parseTools(body.tools) : DEFAULT_WORKFLOW_TOOLS;
  if (body.triggers && !triggers) return c.json({ error: "Invalid triggers" }, 400);
  if (body.tools && !tools) return c.json({ error: "Invalid tools" }, 400);

  const workflowRecord = await createUserWorkflow(db, user.id, {
    connectionId,
    name: typeof body.name === "string" ? body.name : "Untitled",
    enabled: body.enabled === true,
    model: typeof body.model === "string" ? body.model : "",
    instructions: typeof body.instructions === "string" ? body.instructions : "",
    triggers: triggers ?? [],
    tools: tools ?? DEFAULT_WORKFLOW_TOOLS,
  });

  const warning = remoteMismatchWarning(remoteUrl, body.owner, body.repo);
  return c.json({ ok: true, warning, workflow: workflowRecord });
});

workflowConfigRoutes.put("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const workflowId = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid body" }, 400);

  let connectionId: string | undefined;
  if (
    typeof body.projectPath === "string" &&
    typeof body.owner === "string" &&
    typeof body.repo === "string"
  ) {
    const remoteUrl = typeof body.remoteUrl === "string" ? body.remoteUrl : null;
    const repoRecord = await findRepoInUserInstallations(db, user.id, body.owner, body.repo);
    if (!repoRecord) {
      return c.json({ error: "repo_not_accessible" }, 403);
    }
    connectionId = await upsertProjectGithubConnection(user.id, {
      projectPath: body.projectPath,
      owner: body.owner,
      repo: body.repo,
      remoteUrl,
      githubRepoId: repoRecord.githubRepoId,
      installationId: repoRecord.installationId,
    });
  }

  const triggers = body.triggers !== undefined ? parseTriggers(body.triggers) : undefined;
  const tools = body.tools !== undefined ? parseTools(body.tools) : undefined;
  if (body.triggers !== undefined && triggers === null) return c.json({ error: "Invalid triggers" }, 400);
  if (body.tools !== undefined && tools === null) return c.json({ error: "Invalid tools" }, 400);

  const updated = await updateUserWorkflow(db, user.id, workflowId, {
    connectionId,
    name: typeof body.name === "string" ? body.name : undefined,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    instructions: typeof body.instructions === "string" ? body.instructions : undefined,
    triggers: triggers ?? undefined,
    tools: tools ?? undefined,
  });

  if (!updated) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ ok: true, workflow: updated });
});

workflowConfigRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const deleted = await deleteUserWorkflow(db, user.id, c.req.param("id"));
  if (!deleted) return c.json({ error: "Workflow not found" }, 404);
  return c.json({ ok: true });
});
