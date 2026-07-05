import { Hono } from "hono";
import { Result } from "better-result";
import type { SourceControlProvider } from "@openharness/db/schema";
import { requireOrg, type AppVariables } from "../org/middleware.js";
import { respondFromSourceControlResult, trySourceControlPromise } from "../result-helpers.js";
import { getSourceControlProvider } from "./registry.js";
import type { SubmitReviewInput } from "./pr-context.js";

export const sourceControlRoutes = new Hono<{ Variables: AppVariables }>();

function parseProvider(value: string): SourceControlProvider | null {
  if (value === "github" || value === "azure_devops") return value;
  return null;
}

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/open-by-head", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (provider !== "github") {
    return c.json({ error: "Finding pull requests by branch is only supported for GitHub in v1" }, 400);
  }

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const headRef = c.req.query("ref")?.trim();
  if (!headRef) return c.json({ error: "ref query parameter is required" }, 400);

  const { findRepoInOrgInstallations } = await import("../github/sync.js");
  const { createDb } = await import("@openharness/db");
  const { env } = await import("../env.js");
  const { githubFindOpenPullRequestByHead } = await import("./github-pr-service.js");
  const db = createDb(env.databaseUrl());
  const record = await findRepoInOrgInstallations(db, org.organizationId, namespace, repo);
  if (!record?.installationId) return c.json({ error: "repo_not_accessible" }, 403);

  const result = await trySourceControlPromise(
    () => githubFindOpenPullRequestByHead(record.installationId, namespace, repo, headRef),
    { message: "Failed to find open pull request", status: 400 },
  );
  return respondFromSourceControlResult(c, Result.map(result, (pull) => ({ pull })));
});

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/git-credentials", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return c.json({ error: "Invalid provider" }, 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");

  const adapter = getSourceControlProvider(provider);
  const result = await trySourceControlPromise(
    () => adapter.fetchGitCredentials(org.organizationId, namespace, repo),
    { message: "Failed to fetch git credentials", status: 403 },
  );
  return respondFromSourceControlResult(c, result);
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

  const adapter = getSourceControlProvider(provider);
  const result = await trySourceControlPromise(
    () => adapter.fetchPrContext(org.organizationId, namespace, repo, number),
    { message: "Failed to fetch PR context", status: 400 },
  );
  return respondFromSourceControlResult(c, result);
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

  const adapter = getSourceControlProvider(provider);
  const result = await trySourceControlPromise(
    () => adapter.submitReview(org.organizationId, namespace, repo, number, input).then(() => ({ ok: true as const })),
    { message: "Failed to submit review", status: 400 },
  );
  return respondFromSourceControlResult(c, result);
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

  const adapter = getSourceControlProvider(provider);
  const result = await trySourceControlPromise(
    () =>
      adapter
        .createInlineComment(org.organizationId, namespace, repo, number, {
          body: body.body,
          path: body.path,
          line: body.line,
          side: body.side === "LEFT" ? "LEFT" : "RIGHT",
          commitId: typeof body.commit_id === "string" ? body.commit_id : undefined,
        })
        .then(() => ({ ok: true as const })),
    { message: "Failed to post inline comment", status: 400 },
  );
  return respondFromSourceControlResult(c, result);
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

    const adapter = getSourceControlProvider(provider);
    const result = await trySourceControlPromise(
      () =>
        adapter
          .replyToThread(org.organizationId, namespace, repo, number, threadId, body.body)
          .then(() => ({ ok: true as const })),
      { message: "Failed to reply to thread", status: 400 },
    );
    return respondFromSourceControlResult(c, result);
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

    const adapter = getSourceControlProvider(provider);
    const result = await trySourceControlPromise(
      () =>
        adapter
          .resolveThread(org.organizationId, namespace, repo, number, threadId)
          .then(() => ({ ok: true as const })),
      { message: "Failed to resolve thread", status: 400 },
    );
    return respondFromSourceControlResult(c, result);
  },
);

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/pulls", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (provider !== "github") {
    return c.json({ error: "Create pull request is only supported for GitHub in v1" }, 400);
  }

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.title !== "string" ||
    typeof body.body !== "string" ||
    typeof body.head !== "string"
  ) {
    return c.json({ error: "title, body, and head are required" }, 400);
  }

  const adapter = getSourceControlProvider(provider);
  const result = await trySourceControlPromise(
    () =>
      adapter.createPullRequest(org.organizationId, namespace, repo, {
        title: body.title,
        body: body.body,
        head: body.head,
        base: typeof body.base === "string" ? body.base : undefined,
      }),
    { message: "Failed to create pull request", status: 400 },
  );
  return respondFromSourceControlResult(c, Result.map(result, (pull) => ({ pull })));
});

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

  const adapter = getSourceControlProvider(provider);
  const result = await trySourceControlPromise(
    () =>
      adapter
        .postIssueComment(org.organizationId, namespace, repo, number, body.body)
        .then(() => ({ ok: true as const })),
    { message: "Failed to post comment", status: 400 },
  );
  return respondFromSourceControlResult(c, result);
});
