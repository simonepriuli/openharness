import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAzureDevOpsRemoteUrl } from "./client.js";
import { normalizeAzureDevOpsWebhookEvent } from "./webhook-normalize.js";

describe("parseAzureDevOpsRemoteUrl", () => {
  it("parses HTTPS dev.azure.com remotes", () => {
    assert.deepEqual(
      parseAzureDevOpsRemoteUrl("https://dev.azure.com/contoso/MyProject/_git/my-repo"),
      { org: "contoso", project: "MyProject", repo: "my-repo" },
    );
  });

  it("parses SSH dev.azure.com remotes", () => {
    assert.deepEqual(
      parseAzureDevOpsRemoteUrl("ssh://git@ssh.dev.azure.com/v3/contoso/MyProject/my-repo"),
      { org: "contoso", project: "MyProject", repo: "my-repo" },
    );
  });

  it("returns null for GitHub remotes", () => {
    assert.equal(parseAzureDevOpsRemoteUrl("https://github.com/acme/app.git"), null);
  });
});

describe("normalizeAzureDevOpsWebhookEvent", () => {
  it("maps pull request created events", () => {
    const normalized = normalizeAzureDevOpsWebhookEvent(
      {
        eventType: "git.pullrequest.created",
        id: "evt-1",
        resourceContainers: {
          account: { name: "contoso" },
        },
        resource: {
          pullRequestId: 42,
          repository: {
            name: "my-repo",
            project: { name: "MyProject" },
          },
        },
      },
      { "x-vss-activityid": "delivery-1" },
    );

    assert.deepEqual(normalized, {
      event: "pr_opened",
      deliveryId: "delivery-1",
      namespace: "MyProject",
      repoName: "my-repo",
      prNumber: 42,
      payload: {
        eventType: "git.pullrequest.created",
        id: "evt-1",
        resourceContainers: {
          account: { name: "contoso" },
        },
        resource: {
          pullRequestId: 42,
          repository: {
            name: "my-repo",
            project: { name: "MyProject" },
          },
        },
      },
      connectionExternalId: "contoso",
    });
  });
});
