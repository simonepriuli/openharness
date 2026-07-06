import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import { githubFindOpenPullRequestByHead } from "./github-pr-service.js";

describe("githubFindOpenPullRequestByHead", () => {
  it("returns the first open pull request for a branch head", async () => {
    const fetchMock = (async (path: string) => {
      assert.match(path, /head=acme%3Afeature-branch/);
      return Result.ok(
        new Response(
          JSON.stringify([
            {
              number: 17,
              title: "Feature branch",
              html_url: "https://github.com/acme/app/pull/17",
            },
          ]),
          { status: 200 },
        ),
      );
    }) as typeof import("../github/app-auth.js").githubAppFetch;

    const pullResult = await githubFindOpenPullRequestByHead(
      "installation-1",
      "acme",
      "app",
      "feature-branch",
      { fetch: fetchMock },
    );

    assert.equal(Result.isOk(pullResult), true);
    if (Result.isOk(pullResult)) {
      assert.deepEqual(pullResult.value, {
        number: 17,
        title: "Feature branch",
        url: "https://github.com/acme/app/pull/17",
      });
    }
  });

  it("returns null when no open pull request matches the branch", async () => {
    const fetchMock = (async () =>
      Result.ok(new Response(JSON.stringify([]), { status: 200 }))) as typeof import("../github/app-auth.js").githubAppFetch;

    const pullResult = await githubFindOpenPullRequestByHead(
      "installation-1",
      "acme",
      "app",
      "orphan-branch",
      { fetch: fetchMock },
    );

    assert.equal(Result.isOk(pullResult), true);
    if (Result.isOk(pullResult)) {
      assert.equal(pullResult.value, null);
    }
  });
});
