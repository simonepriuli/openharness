import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWorkflowToolId } from "./workflow-slash-tools.js";

describe("workflow-slash-tools", () => {
  it("recognizes legacy workflow instruction tool ids", () => {
    assert.equal(isWorkflowToolId("pr_comment"), true);
    assert.equal(isWorkflowToolId("web_search"), false);
  });
});
