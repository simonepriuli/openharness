import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAuthorizedCronRequest } from "./cron-auth.js";

describe("isAuthorizedCronRequest", () => {
  it("accepts a matching bearer token", () => {
    assert.equal(
      isAuthorizedCronRequest("Bearer secret-token", "secret-token"),
      true,
    );
  });

  it("is case-insensitive on the Bearer prefix", () => {
    assert.equal(
      isAuthorizedCronRequest("bearer secret-token", "secret-token"),
      true,
    );
  });

  it("rejects a missing authorization header", () => {
    assert.equal(isAuthorizedCronRequest(undefined, "secret-token"), false);
  });

  it("rejects when CRON_SECRET is not configured", () => {
    assert.equal(isAuthorizedCronRequest("Bearer secret-token", undefined), false);
  });

  it("rejects a wrong token", () => {
    assert.equal(isAuthorizedCronRequest("Bearer wrong", "secret-token"), false);
  });

  it("rejects non-bearer authorization schemes", () => {
    assert.equal(isAuthorizedCronRequest("Basic secret-token", "secret-token"), false);
  });
});
