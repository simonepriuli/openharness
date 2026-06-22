import type { TeamsReport } from "../github/workflow-teams-parse.js";

export function buildQueuedCard(workflowCount: number): Record<string, unknown> {
  const noun = workflowCount === 1 ? "workflow" : "workflows";
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: "OpenHarness queued",
        weight: "Bolder",
        size: "Medium",
      },
      {
        type: "TextBlock",
        text: `${workflowCount} ${noun} queued. Your OpenHarness desktop will investigate when it is online.`,
        wrap: true,
      },
    ],
  };
}

export function buildFailedCard(errorMessage: string): Record<string, unknown> {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: "OpenHarness workflow failed",
        weight: "Bolder",
        size: "Medium",
        color: "Attention",
      },
      {
        type: "TextBlock",
        text: errorMessage,
        wrap: true,
      },
    ],
  };
}

export function buildTeamsReportCard(
  report: TeamsReport,
  options?: { title?: string; repoFullName?: string },
): Record<string, unknown> {
  const title = options?.title ?? "OpenHarness workflow complete";
  const body: Array<Record<string, unknown>> = [
    {
      type: "TextBlock",
      text: title,
      weight: "Bolder",
      size: "Medium",
    },
  ];

  if (options?.repoFullName) {
    body.push({
      type: "TextBlock",
      text: options.repoFullName,
      isSubtle: true,
      spacing: "None",
    });
  }

  body.push({
    type: "TextBlock",
    text: report.summary,
    wrap: true,
  });

  if (report.kind === "cve_scan" && report.vulnerabilities.length > 0) {
    const rows = report.vulnerabilities.slice(0, 8).map((row) => ({
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "stretch",
          items: [{ type: "TextBlock", text: row.dependency, wrap: true }],
        },
        {
          type: "Column",
          width: "auto",
          items: [{ type: "TextBlock", text: row.severity ?? "—", wrap: true }],
        },
      ],
    }));
    body.push({
      type: "Container",
      items: rows,
      separator: true,
    });
    if (report.vulnerabilities.length > 8) {
      body.push({
        type: "TextBlock",
        text: `+ ${report.vulnerabilities.length - 8} more vulnerabilities (see OpenHarness for full report)`,
        isSubtle: true,
        wrap: true,
      });
    }
  }

  if (report.kind === "bug_triage" && report.findings.length > 0) {
    body.push({
      type: "TextBlock",
      text: "Findings",
      weight: "Bolder",
      separator: true,
    });
    for (const finding of report.findings.slice(0, 6)) {
      body.push({
        type: "TextBlock",
        text: `• ${finding}`,
        wrap: true,
      });
    }
    if (report.suggestedNextSteps.length > 0) {
      body.push({
        type: "TextBlock",
        text: "Suggested next steps",
        weight: "Bolder",
        separator: true,
      });
      for (const step of report.suggestedNextSteps.slice(0, 4)) {
        body.push({
          type: "TextBlock",
          text: `• ${step}`,
          wrap: true,
        });
      }
    }
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body,
  };
}
