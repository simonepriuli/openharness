import { Hono, type Context } from "hono";
import { Result } from "better-result";
import type { SourceControlProvider } from "@openharness/db/schema";
import { AzureDevOpsApiError, GithubApiError } from "../errors.js";
import { requireOrg, type AppVariables } from "../org/middleware.js";
import {
  respondFromAzureDevOpsResultJson,
  respondFromGithubResultJson,
  respondWithError,
} from "../result-helpers.js";
import { getSourceControlProvider } from "./registry.js";
import type { SubmitReviewInput } from "./pr-context.js";

export const sourceControlRoutes = new Hono<{ Variables: AppVariables }>();

function parseProvider(value: string): SourceControlProvider | null {
  if (value === "github" || value === "azure_devops") return value;
  return null;
}

function respondFromProviderResult<T>(
  c: Context,
  provider: SourceControlProvider,
  result: Result<T, GithubApiError | AzureDevOpsApiError>,
) {
  if (Result.isError(result)) {
    if (provider === "github" && GithubApiError.is(result.error)) {
      return respondFromGithubResultJson(c, result as Result<T, GithubApiError>);
    }
    if (provider === "azure_devops" && AzureDevOpsApiError.is(result.error)) {
      return respondFromAzureDevOpsResultJson(c, result as Result<T, AzureDevOpsApiError>);
    }
    return c.json({ error: result.error.message }, 500);
  }
  return c.json(result.value);
}

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/open-by-head", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (provider !== "github") {
    return respondWithError(
      c,
      "Finding pull requests by branch is only supported for GitHub in v1",
      400,
    );
  }

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const headRef = c.req.query("ref")?.trim();
  if (!headRef) return respondWithError(c, "ref query parameter is required", 400);

  const { findRepoInOrgInstallations } = await import("../github/sync.js");
  const { createDb } = await import("@openharness/db");
  const { env } = await import("../env.js");
  const { githubFindOpenPullRequestByHead } = await import("./github-pr-service.js");
  const db = createDb(env.databaseUrl());
  const record = await findRepoInOrgInstallations(db, org.organizationId, namespace, repo);
  if (!record?.installationId) return c.json({ error: "repo_not_accessible" }, 403);

  const pullResult = await githubFindOpenPullRequestByHead(
    record.installationId,
    namespace,
    repo,
    headRef,
  );
  return respondFromGithubResultJson(c, Result.map(pullResult, (pull) => ({ pull })));
});

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/git-credentials", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return respondWithError(c, "Invalid provider", 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");

  const adapter = getSourceControlProvider(provider);
  const result = await adapter.fetchGitCredentials(org.organizationId, namespace, repo);
  return respondFromProviderResult(c, provider, result);
});

sourceControlRoutes.get("/pr/:provider/:namespace/:repo/:number/context", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return respondWithError(c, "Invalid provider", 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  if (!Number.isFinite(number)) return respondWithError(c, "Invalid PR number", 400);

  const adapter = getSourceControlProvider(provider);
  const result = await adapter.fetchPrContext(org.organizationId, namespace, repo, number);
  return respondFromProviderResult(c, provider, result);
});

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/:number/review", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return respondWithError(c, "Invalid provider", 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || (body.event !== "APPROVE" && body.event !== "COMMENT")) {
    return respondWithError(c, "event must be APPROVE or COMMENT", 400);
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
  const result = await adapter.submitReview(org.organizationId, namespace, repo, number, input);
  if (Result.isError(result)) {
    return respondFromProviderResult(c, provider, result);
  }
  return c.json({ ok: true });
});

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/:number/inline-comments", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return respondWithError(c, "Invalid provider", 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string" || typeof body.path !== "string" || typeof body.line !== "number") {
    return respondWithError(c, "body, path, and line are required", 400);
  }

  const adapter = getSourceControlProvider(provider);
  const result = await adapter.createInlineComment(org.organizationId, namespace, repo, number, {
    body: body.body,
    path: body.path,
    line: body.line,
    side: body.side === "LEFT" ? "LEFT" : "RIGHT",
    commitId: typeof body.commit_id === "string" ? body.commit_id : undefined,
  });
  if (Result.isError(result)) {
    return respondFromProviderResult(c, provider, result);
  }
  return c.json({ ok: true });
});

sourceControlRoutes.post(
  "/pr/:provider/:namespace/:repo/:number/threads/:threadId/reply",
  async (c) => {
    const org = requireOrg(c);
    if (!org) return c.json({ error: "Unauthorized" }, 401);

    const provider = parseProvider(c.req.param("provider"));
    if (!provider) return respondWithError(c, "Invalid provider", 400);

    const namespace = c.req.param("namespace");
    const repo = c.req.param("repo");
    const number = Number.parseInt(c.req.param("number"), 10);
    const threadId = c.req.param("threadId");
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.body !== "string") {
      return respondWithError(c, "body is required", 400);
    }

    const adapter = getSourceControlProvider(provider);
    const result = await adapter.replyToThread(
      org.organizationId,
      namespace,
      repo,
      number,
      threadId,
      body.body,
    );
    if (Result.isError(result)) {
      return respondFromProviderResult(c, provider, result);
    }
    return c.json({ ok: true });
  },
);

sourceControlRoutes.post(
  "/pr/:provider/:namespace/:repo/:number/threads/:threadId/resolve",
  async (c) => {
    const org = requireOrg(c);
    if (!org) return c.json({ error: "Unauthorized" }, 401);

    const provider = parseProvider(c.req.param("provider"));
    if (!provider) return respondWithError(c, "Invalid provider", 400);

    const namespace = c.req.param("namespace");
    const repo = c.req.param("repo");
    const number = Number.parseInt(c.req.param("number"), 10);
    const threadId = c.req.param("threadId");

    const adapter = getSourceControlProvider(provider);
    const result = await adapter.resolveThread(
      org.organizationId,
      namespace,
      repo,
      number,
      threadId,
    );
    if (Result.isError(result)) {
      return respondFromProviderResult(c, provider, result);
    }
    return c.json({ ok: true });
  },
);

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/pulls", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (provider !== "github") {
    return respondWithError(c, "Create pull request is only supported for GitHub in v1", 400);
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
    return respondWithError(c, "title, body, and head are required", 400);
  }

  const adapter = getSourceControlProvider(provider);
  const result = await adapter.createPullRequest(org.organizationId, namespace, repo, {
    title: body.title,
    body: body.body,
    head: body.head,
    base: typeof body.base === "string" ? body.base : undefined,
  });
  return respondFromProviderResult(c, provider, Result.map(result, (pull) => ({ pull })));
});

sourceControlRoutes.post("/pr/:provider/:namespace/:repo/:number/issue-comments", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const provider = parseProvider(c.req.param("provider"));
  if (!provider) return respondWithError(c, "Invalid provider", 400);

  const namespace = c.req.param("namespace");
  const repo = c.req.param("repo");
  const number = Number.parseInt(c.req.param("number"), 10);
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body.body !== "string") {
    return respondWithError(c, "body is required", 400);
  }

  const adapter = getSourceControlProvider(provider);
  const result = await adapter.postIssueComment(
    org.organizationId,
    namespace,
    repo,
    number,
    body.body,
  );
  if (Result.isError(result)) {
    return respondFromProviderResult(c, provider, result);
  }
  return c.json({ ok: true });
});
