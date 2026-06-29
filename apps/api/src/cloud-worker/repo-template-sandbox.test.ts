import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAuthenticatedRemoteUrl, repoDirForConnection } from "./repo-template-sandbox.js";
import { runSandboxName, templateSandboxName } from "./sandbox-names.js";
import { SANDBOX_REPOS_ROOT } from "./sandbox-dispatch-env.js";

describe("templateSandboxName", () => {
  it("builds a stable per-connection template name including bundle fingerprint", () => {
    assert.equal(
      templateSandboxName("org_123", "conn_abc", "fingerprint-abc123"),
      "openharness-repo-template-org-123-conn-abc-fingerprint-abc1",
    );
  });

  it("sanitizes unsafe characters", () => {
    assert.equal(
      templateSandboxName("org/foo", "conn:bar", "fp:v1"),
      "openharness-repo-template-org-foo-conn-bar-fp-v1",
    );
  });
});

describe("runSandboxName", () => {
  it("builds a per-run sandbox name", () => {
    assert.equal(runSandboxName("run-1"), "openharness-run-run-1");
  });
});

describe("buildAuthenticatedRemoteUrl", () => {
  it("embeds credentials in https remote url", () => {
    const url = buildAuthenticatedRemoteUrl(
      "https://github.com/acme/repo.git",
      "x-access-token",
      "secret",
    );
    assert.match(url, /^https:\/\/x-access-token:secret@github\.com\/acme\/repo\.git$/);
  });
});

describe("repoDirForConnection", () => {
  it("uses the standard repos root layout", () => {
    assert.equal(
      repoDirForConnection("org-1", "conn-1"),
      `${SANDBOX_REPOS_ROOT}/org-1/conn-1`,
    );
  });
});
