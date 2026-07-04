import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WorkflowTemplate } from "../preload/api.js";
import {
  filterAvailableWorkflowTemplates,
  isWorkflowTemplateAvailable,
  type WorkflowIntegrationAvailability,
} from "./workflow-template-availability.js";

function fullAvailability(
  overrides: Partial<WorkflowIntegrationAvailability> = {},
): WorkflowIntegrationAvailability {
  return {
    sourceControlReady: true,
    teamsConnected: true,
    discordConnected: true,
    linearConnected: true,
    ...overrides,
  };
}

const prReviewTemplate: WorkflowTemplate = {
  id: "pr_review",
  name: "PR auto review",
  description: "Review pull requests.",
  model: "",
  instructions: "",
  triggers: [{ id: "t1", kind: "git_pr", event: "pr_opened" }],
  tools: {
    prComment: true,
    prApprove: true,
    prPush: false,
    prCreate: false,
    teamsNotify: false,
  },
};

const teamsTriageTemplate: WorkflowTemplate = {
  id: "teams_bug_triage",
  name: "Teams bug triage",
  description: "Triage Teams mentions.",
  model: "",
  instructions: "",
  triggers: [{ id: "t1", kind: "teams_mention" }],
  tools: {
    prComment: false,
    prApprove: false,
    prPush: false,
    prCreate: false,
    teamsNotify: true,
  },
};

const cveScanTemplate: WorkflowTemplate = {
  id: "dependency_cve_scan",
  name: "Dependency CVE scan",
  description: "Scan dependencies.",
  model: "",
  instructions: "",
  triggers: [
    {
      id: "t1",
      kind: "schedule",
      preset: "weekly",
      cronExpression: "0 9 * * 1",
      timezone: "UTC",
      label: "Weekly",
    },
  ],
  tools: {
    prComment: false,
    prApprove: false,
    prPush: false,
    prCreate: false,
    teamsNotify: true,
  },
};

const discordCveScanTemplate: WorkflowTemplate = {
  ...cveScanTemplate,
  id: "discord_cve_scan",
  name: "Discord CVE scan",
  tools: {
    prComment: false,
    prApprove: false,
    prPush: false,
    prCreate: false,
    teamsNotify: false,
    discordNotify: true,
  },
};

const linearImplementationTemplate: WorkflowTemplate = {
  id: "linear_issue_implementation",
  name: "Linear issue implementation",
  description: "Implement Linear issues.",
  model: "",
  instructions: "",
  triggers: [{ id: "t1", kind: "linear", event: "linear_issue_created" }],
  tools: {
    prComment: true,
    prApprove: false,
    prPush: true,
    prCreate: true,
    teamsNotify: false,
    linearRead: true,
    linearWrite: true,
    linearComments: true,
  },
};

const sampleTemplates = [
  prReviewTemplate,
  teamsTriageTemplate,
  cveScanTemplate,
  discordCveScanTemplate,
  linearImplementationTemplate,
];

describe("workflow template availability", () => {
  it("shows all templates when every integration is connected", () => {
    assert.equal(filterAvailableWorkflowTemplates(sampleTemplates, fullAvailability()).length, 5);
  });

  it("hides Teams templates when Teams is not connected", () => {
    const availability = fullAvailability({ teamsConnected: false });
    assert.equal(isWorkflowTemplateAvailable(teamsTriageTemplate, availability), false);
    assert.equal(isWorkflowTemplateAvailable(cveScanTemplate, availability), false);
    assert.equal(isWorkflowTemplateAvailable(discordCveScanTemplate, availability), true);
    assert.equal(isWorkflowTemplateAvailable(prReviewTemplate, availability), true);
  });

  it("hides Discord CVE scan when Discord is not connected", () => {
    const availability = fullAvailability({ discordConnected: false });
    assert.equal(isWorkflowTemplateAvailable(discordCveScanTemplate, availability), false);
  });

  it("hides PR templates when source control is not configured", () => {
    const availability = fullAvailability({ sourceControlReady: false });
    assert.equal(isWorkflowTemplateAvailable(prReviewTemplate, availability), false);
    assert.equal(isWorkflowTemplateAvailable(linearImplementationTemplate, availability), false);
  });

  it("requires both Linear and source control for implementation template", () => {
    assert.equal(
      isWorkflowTemplateAvailable(
        linearImplementationTemplate,
        fullAvailability({ linearConnected: false }),
      ),
      false,
    );
    assert.equal(
      isWorkflowTemplateAvailable(
        linearImplementationTemplate,
        fullAvailability({ sourceControlReady: false }),
      ),
      false,
    );
  });
});
