import { and, createDb, eq } from "@openharness/db";
import { projectGithubConnection } from "@openharness/db/schema";
import { Hono } from "hono";
import { env } from "../env.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";

function isOrgAdmin(role: string): boolean {
  return role === "owner" || role === "admin";
}
import {
  deleteRunnerBinding,
  heartbeatRunnerBindings,
  listRunnerBindings,
  upsertRunnerBinding,
} from "./runner-bindings-db.js";

const db = createDb(env.databaseUrl());

export const runnerBindingRoutes = new Hono<{ Variables: AppVariables }>();

runnerBindingRoutes.get("/", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const runnerInstanceId = c.req.query("runnerInstanceId") ?? undefined;
  const canSeeAll = isOrgAdmin(org.role);

  const bindings = await listRunnerBindings(db, org.organizationId, {
    runnerInstanceId,
    userId: canSeeAll ? undefined : user.id,
  });

  return c.json({ bindings });
});

runnerBindingRoutes.put("/", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.runnerInstanceId !== "string" ||
    typeof body.connectionId !== "string" ||
    typeof body.projectPath !== "string"
  ) {
    return c.json({ error: "runnerInstanceId, connectionId, and projectPath are required" }, 400);
  }

  const connRows = await db
    .select()
    .from(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.id, body.connectionId),
        eq(projectGithubConnection.organizationId, org.organizationId),
      ),
    )
    .limit(1);

  if (!connRows[0]) {
    return c.json({ error: "Connection not found" }, 404);
  }

  const binding = await upsertRunnerBinding(db, org.organizationId, user.id, {
    runnerInstanceId: body.runnerInstanceId.trim(),
    connectionId: body.connectionId,
    projectPath: body.projectPath,
    label: typeof body.label === "string" ? body.label : null,
  });

  return c.json({ ok: true, binding });
});

runnerBindingRoutes.delete("/:id", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const bindingId = c.req.param("id");
  const bindings = await listRunnerBindings(db, org.organizationId);
  const target = bindings.find((row) => row.id === bindingId);
  if (!target) {
    return c.json({ error: "Binding not found" }, 404);
  }

  const canManage = isOrgAdmin(org.role);
  if (!canManage && target.userId !== user.id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const result = await deleteRunnerBinding(db, org.organizationId, bindingId);
  if (!result.deleted) {
    return c.json({ error: "Binding not found" }, 404);
  }

  return c.json({ ok: true });
});

runnerBindingRoutes.post("/heartbeat", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.runnerInstanceId !== "string") {
    return c.json({ error: "runnerInstanceId is required" }, 400);
  }

  await heartbeatRunnerBindings(db, org.organizationId, body.runnerInstanceId.trim(), {
    label: typeof body.label === "string" ? body.label : undefined,
  });

  return c.json({ ok: true });
});
