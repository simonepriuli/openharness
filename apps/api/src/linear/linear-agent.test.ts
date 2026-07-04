import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linearGrantedScopesIncludeAgent } from "./linear-oauth.js";
import {
  isLinearAgentSessionEvent,
  parseLinearAgentIssueFromPayload,
  parseLinearAgentTrigger,
} from "./linear-agent-webhook-payload.js";

describe("linearGrantedScopesIncludeAgent", () => {
  it("returns true when assignable and mentionable scopes are present", () => {
    assert.equal(
      linearGrantedScopesIncludeAgent("read,write,app:assignable,app:mentionable"),
      true,
    );
  });

  it("returns false when agent scopes are missing", () => {
    assert.equal(linearGrantedScopesIncludeAgent("read,write,issues:create"), false);
    assert.equal(linearGrantedScopesIncludeAgent(null), false);
  });
});

describe("linear agent webhook payload", () => {
  it("detects AgentSessionEvent", () => {
    assert.equal(isLinearAgentSessionEvent({ type: "AgentSessionEvent" }), true);
    assert.equal(isLinearAgentSessionEvent({ type: "Issue" }), false);
  });

  it("parses issue and trigger from created delegate session", () => {
    const payload = {
      type: "AgentSessionEvent",
      action: "created",
      agentSession: {
        id: "sess_1",
        issue: {
          id: "issue_1",
          identifier: "ENG-1",
          title: "Fix bug",
          project: { id: "proj_1" },
          delegate: { id: "app_1" },
        },
      },
      promptContext: "Please fix the bug",
    };

    assert.deepEqual(parseLinearAgentIssueFromPayload(payload), {
      issueId: "issue_1",
      issueIdentifier: "ENG-1",
      projectId: "proj_1",
      issueTitle: "Fix bug",
    });
    assert.equal(parseLinearAgentTrigger(payload), "delegated");
  });

  it("parses mentioned trigger when no delegate is set", () => {
    const payload = {
      type: "AgentSessionEvent",
      action: "created",
      agentSession: {
        id: "sess_2",
        issue: {
          id: "issue_2",
          identifier: "ENG-2",
          project: { id: "proj_1" },
        },
      },
    };

    assert.equal(parseLinearAgentTrigger(payload), "mentioned");
  });

  it("parses prompted follow-up trigger", () => {
    const payload = {
      type: "AgentSessionEvent",
      action: "prompted",
      agentSession: { id: "sess_3" },
      agentActivity: { body: "Can you also add tests?" },
    };

    assert.equal(parseLinearAgentTrigger(payload), "prompted");
  });
});
