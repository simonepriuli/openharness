import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  resolveLinearWebhookSecret,
  validateLinearWebhookAuth,
} from "./linear-webhook-verify.js";

describe("resolveLinearWebhookSecret", () => {
  it("prefers env secret when payload webhook id does not match installation", () => {
    const secret = resolveLinearWebhookSecret({
      envSecret: "lin_wh_app",
      payloadWebhookId: "oauth-app-webhook",
      installation: {
        webhookId: "api-created-webhook",
        webhookSecret: "lin_wh_api",
      },
    });
    assert.equal(secret, "lin_wh_app");
  });

  it("uses installation secret when webhook ids match", () => {
    const secret = resolveLinearWebhookSecret({
      envSecret: "lin_wh_app",
      payloadWebhookId: "same-id",
      installation: {
        webhookId: "same-id",
        webhookSecret: "lin_wh_api",
      },
    });
    assert.equal(secret, "lin_wh_api");
  });
});

describe("validateLinearWebhookAuth", () => {
  it("accepts a valid signature and fresh timestamp", () => {
    const secret = "lin_wh_test";
    const body = JSON.stringify({
      type: "Issue",
      action: "create",
      webhookTimestamp: Date.now(),
    });
    const signature = createHmac("sha256", secret).update(body).digest("hex");

    assert.equal(
      validateLinearWebhookAuth({
        rawBody: body,
        signatureHeader: signature,
        webhookTimestamp: JSON.parse(body).webhookTimestamp,
        secret,
      }),
      null,
    );
  });

  it("rejects invalid signatures", () => {
    const body = JSON.stringify({ webhookTimestamp: Date.now() });
    assert.equal(
      validateLinearWebhookAuth({
        rawBody: body,
        signatureHeader: "deadbeef",
        webhookTimestamp: JSON.parse(body).webhookTimestamp,
        secret: "lin_wh_test",
      }),
      "invalid_signature",
    );
  });
});
