import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectRemoteProvider,
  parseAzureDevOpsRemoteUrl,
  parseGithubRemoteUrl,
} from "./git-remote.js";

describe("git-remote provider detection", () => {
  it("detects GitHub remotes", () => {
    assert.deepEqual(detectRemoteProvider("git@github.com:acme/app.git"), {
      provider: "github",
      namespace: "acme",
      name: "app",
    });
  });

  it("detects Azure DevOps remotes", () => {
    assert.deepEqual(
      detectRemoteProvider("https://dev.azure.com/contoso/MyProject/_git/my-repo"),
      {
        provider: "azure_devops",
        namespace: "MyProject",
        name: "my-repo",
      },
    );
  });
});

describe("parseGithubRemoteUrl", () => {
  it("parses SSH GitHub remotes", () => {
    assert.deepEqual(parseGithubRemoteUrl("git@github.com:acme/app.git"), {
      owner: "acme",
      repo: "app",
    });
  });
});

describe("parseAzureDevOpsRemoteUrl", () => {
  it("parses ADO HTTPS remotes", () => {
    assert.deepEqual(parseAzureDevOpsRemoteUrl("https://dev.azure.com/org/Proj/_git/repo"), {
      project: "Proj",
      repo: "repo",
    });
  });
});
