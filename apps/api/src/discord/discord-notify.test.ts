import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DiscordChannelRepoMappingRecord } from "./discord-db.js";
import { buildDiscordMessagePayload, postChannelMessage } from "./discord-notify.js";

const mapping: DiscordChannelRepoMappingRecord = {
  id: "mapping-1",
  organizationId: "org-1",
  userId: "user-1",
  installationId: "installation-1",
  guildId: "guild-1",
  channelId: "channel-1",
  channelName: "bugs",
  provider: "github",
  namespace: "owner",
  repoName: "repo",
  githubOwner: "owner",
  githubRepo: "repo",
  projectSourceControlConnectionId: null,
  threadId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

describe("buildDiscordMessagePayload", () => {
  it("omits message_reference when there is no reply target", () => {
    assert.deepEqual(buildDiscordMessagePayload(mapping, "Workflow complete."), {
      content: "Workflow complete.",
    });
  });

  it("includes message_reference only when a reply target is provided", () => {
    assert.deepEqual(buildDiscordMessagePayload(mapping, "Workflow complete.", "message-1"), {
      content: "Workflow complete.",
      message_reference: {
        message_id: "message-1",
        channel_id: "channel-1",
        guild_id: "guild-1",
      },
      allowed_mentions: { replied_user: false },
    });
  });
});

describe("postChannelMessage", () => {
  it("retries without a reply target when Discord no longer knows the referenced message", async () => {
    const originalFetch = globalThis.fetch;
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      if (bodies.length === 1) {
        return new Response(
          JSON.stringify({
            message: "Invalid Form Body",
            code: 50035,
            errors: {
              message_reference: {
                _errors: [
                  {
                    code: "MESSAGE_REFERENCE_UNKNOWN_MESSAGE",
                    message: "Unknown message",
                  },
                ],
              },
            },
          }),
          { status: 400, statusText: "Bad Request" },
        );
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      await postChannelMessage("bot-token", mapping, "Workflow complete.", "interaction-id");
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(bodies.length, 2);
    assert.ok(bodies[0]?.message_reference);
    assert.equal(bodies[1]?.message_reference, undefined);
  });
});
