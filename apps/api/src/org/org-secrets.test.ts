import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encryptSecret, decryptSecret } from "../crypto/secrets.js";
import {
  ORG_SECRET_SLOTS,
  isOrgSecretSlot,
  maskSecretValue,
} from "@openharness/shared/org-secret-slots";
import { OrgSecretsError } from "../errors.js";

describe("org secret slots", () => {
  it("includes all structured slots", () => {
    assert.equal(ORG_SECRET_SLOTS.length, 9);
    assert.ok(isOrgSecretSlot("openrouter"));
    assert.ok(isOrgSecretSlot("exa"));
    assert.ok(isOrgSecretSlot("openrouter_management"));
    assert.equal(isOrgSecretSlot("unknown"), false);
  });

  it("maskSecretValue never exposes full key", () => {
    const masked = maskSecretValue("sk-test-secret-key-1234");
    assert.ok(masked.includes("1234"));
    assert.ok(!masked.includes("sk-test"));
  });
});

describe("secret crypto", () => {
  it("roundtrips encrypt and decrypt", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-crypto";
    delete process.env.ORG_SECRETS_ENCRYPTION_KEY;
    const plaintext = "super-secret-api-key";
    const encrypted = encryptSecret(plaintext);
    assert.notEqual(encrypted, plaintext);
    assert.equal(decryptSecret(encrypted), plaintext);
  });
});

describe("OrgSecretsError", () => {
  it("carries error codes", () => {
    const err = new OrgSecretsError({ code: "INVALID_SLOT", message: "bad slot" });
    assert.equal(err.code, "INVALID_SLOT");
  });
});
