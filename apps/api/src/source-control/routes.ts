import { Hono } from "hono";
import type { SourceControlProvider } from "@openharness/db/schema";
import { requireOrg, type AppVariables } from "../org/middleware.js";
import { getSourceControlProvider } from "./registry.js";
import type { SubmitReviewInput } from "./pr-context.js";

export const sourceControlRoutes = new Hono<{ Variables: AppVariables }>();

function parseProvider(value: string): SourceControlProvider | null {
  if (value === "github" || value === "azure_devops") return value;
  return null;
}

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/git-credentials", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return c.json({ error: "Invalid provider" }, 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");

  try {
    const adapter = getSourceControlProvider(provider);
    const credentials = await adapter.fetchGitCredentials(org.organizationId, namespace, repo);
    return c.json(credentials);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch git credentials";
    return c.json({ error: message }, 403);
  }
});

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/:number/context", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return c.json({ error: "Invalid provider" }, 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isFinite(number)) return c.json({ error: "Invalid PR number" }, 400);

  try {
    const adapter = getSourceControlProvider(provider);
    const context = await adapter.fetchPrContext(org.organizationId, namespace, repo, number);
    return c.json(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch PR context";
    return c.json({ error: message }, 400);
  }
});

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/:number/review", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return c.json({ error: "Invalid provider" }, 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || (body.event !== "APPROVE" && body.event !== "COMMENT")) {
    return c.json({ error: "event must be APPROVE or COMMENT" }, 400);
  }

  const input: SubmitReviewInput = {
    event: body.event,
    body: typeof body.body === "string" ? body.body : "",
    commitId: typeof body.commit_id === "string" ? body.commit_id : undefined,
    comments: Array.isArray(body.comments)
      ? body.comments.map((comment: Record<string, unknown>) => ({
          path: String(comment.path ?? ""),
          line: Number(comment.line),
          body: String(comment.body ?? ""),
          side: comment.side === "LEFT" ? "LEFT" : "RIGHT",
        }))
      : undefined,
  };

  try {
    const adapter = getSourceControlProvider(provider);
    await adapter.submitReview(org.organizationId, namespace, repo, number, input);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit review";
    return c.json({ error: message }, 400);
  }
});

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/:number/inline-comments", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return c.json({ error: "Invalid provider" }, 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string" || typeof body.path !== "string" || typeof body.line !== "number") {
    return c.json({ error: "body, path, and line are required" }, 400);
  }

  try {
    const adapter = getSourceControlProvider(provider);
    await adapter.createInlineComment(org.organizationId, namespace, repo, number, {
      body: body.body,
      path: body.path,
      line: body.line,
      side: body.side === "LEFT" ? "LEFT" : "RIGHT",
      commitId: typeof body.commit_id === "string" ? body.commit_id : undefined,
    });
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post inline comment";
    return c.json({ error: message }, 400);
  }
});

sourceControlRoutes.post(
  "/pr/:provider/:namespace/:repo/:number/threads/:threadId/reply",
  async (c) => {
    const org = requireOrg(c);
    if (!org) return c.json({ error: "Unauthorized" }, 401);

    const provider = parseProvider(c.req.param("provider"));
    if (!provider) return c.json({ error: "Invalid provider" }, 400);

    const namespace = c.req.param("namespace");
    const repo = c.req.param("repo");
    const number = Number.parseInt(c.req.param("number"), 10);
    const threadId = c.req.param("threadId");
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.body !== "string") {
      return c.json({ error: "body is required" }, 400);
    }

    try {
      const adapter = getSourceControlProvider(provider);
      await adapter.replyToThread(org.organizationId, namespace, repo, number, threadId, body.body);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reply to thread";
      return c.json({ error: message }, 400);
    }
  },
);

sourceControlRoutes.post(
  "/pr/:provider/:namespace/:repo/:number/threads/:threadId/resolve",
  async (c) => {
    const org = requireOrg(c);
    if (!org) return c.json({ error: "Unauthorized" }, 401);

    const provider = parseProvider(c.req.param("provider"));
    if (!provider) return c.json({ error: "Invalid provider" }, 400);

    const namespace = c.req.param("namespace");
    const repo = c.req.param("repo");
    const number = Number.parseInt(c.req.param("number"), 10);
    const threadId = c.req.param("threadId");

    try {
      const adapter = getSourceControlProvider(provider);
      await adapter.resolveThread(org.organizationId, namespace, repo, number, threadId);
      return c.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resolve thread";
      return c.json({ error: message }, 400);
    }
  },
);

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/:number/issue-comments", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return c.json({ error: "Invalid provider" }, 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return c.json({ error: "body is required" }, 400);
  }

  try {
    const adapter = getSourceControlProvider(provider);
    await adapter.postIssueComment(org.organizationId, namespace, repo, number, body.body);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to post comment";
    return c.json({ error: message }, 400);
  }
});
