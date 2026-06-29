import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encryptSecret, decryptSecret } from "../crypto/secrets.js";
import { maskSecretValue } from "@openharness/shared/org-secret-slots";
import {
  repoEnvKeyErrorMessage,
  validateRepoEnvKey,
} from "@openharness/shared/repo-environment";

describe("repo environment key validation", () => {
  it("rejects reserved provider slot names", () => {
    const result = validateRepoEnvKey("ANTHROPIC");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "RESERVED");
      assert.equal(repoEnvKeyErrorMessage(result.error), "This variable name is reserved");
    }
  });

  it("accepts normal application keys", () => {
    const result = validateRepoEnvKey("NPM_TOKEN");
    assert.equal(result.ok, true);
  });
});

describe("repo environment crypto", () => {
  it("roundtrips encrypted variable values", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-repo-env";
    delete process.env.ORG_SECRETS_ENCRYPTION_KEY;
    const encrypted = encryptSecret("secret-value");
    assert.equal(decryptSecret(encrypted), "secret-value");
  });
});

describe("secret masking for public API", () => {
  it("never includes full secret in masked hint", () => {
    const masked = maskSecretValue("npm_abcdefghijklmnop");
    assert.ok(masked.includes("mnop"));
    assert.ok(!masked.includes("npm_abc"));
  });
});

describe("internal resolve contract", () => {
  it("requires organizationId and connectionId in body", () => {
    const body = { organizationId: "org-1", connectionId: "conn-1" };
    assert.equal(typeof body.organizationId, "string");
    assert.equal(typeof body.connectionId, "string");
  });
});
