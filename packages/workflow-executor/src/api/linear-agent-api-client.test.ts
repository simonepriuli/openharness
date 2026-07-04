import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInternalLinearAgentRunApiClient } from "./linear-agent-api-client.js";

describe("createInternalLinearAgentRunApiClient", () => {
  it("fetches git credentials from the internal source-control route", async () => {
    let url = "";
    const client = createInternalLinearAgentRunApiClient({
      baseUrl: "https://api.example.com",
      secret: "worker-secret",
      organizationId: "org-1",
      fetchImpl: async (requestUrl) => {
        url = String(requestUrl);
        return new Response(
          JSON.stringify({
            username: "x-access-token",
            token: "ghs_test",
            remoteUrl: "https://github.com/acme/app.git",
          }),
          { status: 200 },
        );
      },
    });

    const credentials = await client.fetchGitCredentials("github", "acme", "app");
    assert.equal(credentials.token, "ghs_test");
    assert.equal(
      url,
      "https://api.example.com/api/internal/source-control/pr/github/acme/app/git-credentials?organizationId=org-1",
    );
  });
});
