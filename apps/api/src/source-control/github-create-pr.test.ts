import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import { githubCreatePullRequest } from "./github-pr-service.js";

describe("githubCreatePullRequest", () => {
  it("creates a pull request using the repository default branch when base is omitted", async () => {
    const calls: Array<{ path: string; method?: string; body?: string }> = [];

    const fetchMock = (async (
      path: string,
      options: RequestInit & { installationId?: string } = {},
    ) => {
      calls.push({
        path,
        method: options.method,
        body: typeof options.body === "string" ? options.body : undefined,
      });

      if (path === "/repos/acme/app") {
        return Result.ok(new Response(JSON.stringify({ default_branch: "main" }), { status: 200 }));
      }
      if (path === "/repos/acme/app/pulls" && options.method === "POST") {
        return Result.ok(
          new Response(
            JSON.stringify({
              number: 42,
              title: "Add feature",
              html_url: "https://github.com/acme/app/pull/42",
              head: { ref: "feature-branch" },
              base: { ref: "main" },
            }),
            { status: 201 },
          ),
        );
      }
      return Result.ok(new Response("not found", { status: 404 }));
    }) as typeof import("../github/app-auth.js").githubAppFetch;

    const pullResult = await githubCreatePullRequest(
      "installation-1",
      "acme",
      "app",
      {
        title: "Add feature",
        body: "Summary",
        head: "feature-branch",
      },
      { fetch: fetchMock },
    );

    assert.equal(Result.isOk(pullResult), true);
    if (Result.isOk(pullResult)) {
      assert.equal(pullResult.value.number, 42);
      assert.equal(pullResult.value.baseRef, "main");
    }
    assert.equal(calls.length, 2);
    assert.match(calls[1]?.body ?? "", /"base":"main"/);
  });
});
