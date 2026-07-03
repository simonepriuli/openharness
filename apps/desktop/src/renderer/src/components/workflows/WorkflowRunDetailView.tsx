import { useEffect, useState } from "react";
import type {
  CveVulnerability,
  WorkflowRunResultPayload,
  WorkflowRunSummary,
} from "../../../../preload/api";
import { useWorkflowRunQuery } from "../../queries/use-workflows";
import type { TimelineState } from "../../events";
import { MarkdownContent } from "../MarkdownContent";
import { SettingsTabs } from "../settings/SettingsTabs";
import { WorkflowRunDuration } from "./WorkflowRunDuration";
import {
  ACTIVE_WORKFLOW_RUN_STATUSES,
  WorkflowRunStatusBadge,
} from "./WorkflowRunStatusBadge";
import { WorkflowRunTranscriptPanel } from "./WorkflowRunTranscriptPanel";

type WorkflowRunDetailTab = "transcripts" | "summary";

type WorkflowRunSummaryDetailProps = {
  run: WorkflowRunSummary;
  error: string | null;
  isStreaming?: boolean;
  timeline: TimelineState;
  onBack?: () => void;
};

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function resolveDisplayStatus(run: WorkflowRunSummary, isStreaming: boolean, error: string | null): string {
  if (isStreaming) return "running";
  if (error) return "failed";
  return run.status;
}

function formatPrReviewAction(action: "approve" | "comment"): string {
  return action === "approve" ? "Approve" : "Comment";
}

function workflowRunActiveNote(run: WorkflowRunSummary): string {
  if (run.resolvedExecutor === "cloud") {
    return "OpenHarness is running this workflow on a cloud runner.";
  }
  return "OpenHarness is running this workflow locally on your device.";
}

function CveVulnerabilitiesTable({ vulnerabilities }: { vulnerabilities: CveVulnerability[] }) {
  if (vulnerabilities.length === 0) return null;

  return (
    <div className="workflow-run-result-block">
      <h3 className="workflow-run-result-heading">Vulnerabilities</h3>
      <div className="workflow-run-vuln-table-wrap">
        <table className="workflow-run-vuln-table">
          <thead>
            <tr>
              <th scope="col">Dependency</th>
              <th scope="col">Severity</th>
              <th scope="col">Advisory</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {vulnerabilities.map((row, index) => (
              <tr key={`${row.dependency}-${index}`}>
                <td>
                  {row.dependency}
                  {row.version ? ` @ ${row.version}` : ""}
                </td>
                <td>{row.severity ?? "—"}</td>
                <td>{row.advisory ?? "—"}</td>
                <td>{row.action ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkflowRunResultPayloadView({ payload }: { payload: WorkflowRunResultPayload }) {
  if (payload.kind === "cve_scan") {
    return (
      <>
        {payload.summary ? (
          <p className="workflow-run-result-summary">{payload.summary}</p>
        ) : null}
        <CveVulnerabilitiesTable vulnerabilities={payload.vulnerabilities} />
      </>
    );
  }

  if (payload.kind === "bug_triage") {
    return (
      <>
        {payload.summary ? (
          <p className="workflow-run-result-summary">{payload.summary}</p>
        ) : null}
        {payload.findings.length > 0 ? (
          <div className="workflow-run-result-block">
            <h3 className="workflow-run-result-heading">Findings</h3>
            <ul className="workflow-run-result-list">
              {payload.findings.map((finding, index) => (
                <li key={`${index}-${finding.slice(0, 24)}`}>{finding}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {payload.suggestedNextSteps.length > 0 ? (
          <div className="workflow-run-result-block">
            <h3 className="workflow-run-result-heading">Suggested next steps</h3>
            <ul className="workflow-run-result-list">
              {payload.suggestedNextSteps.map((step, index) => (
                <li key={`${index}-${step.slice(0, 24)}`}>{step}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </>
    );
  }

  if (payload.kind === "pr_review") {
    return (
      <div className="workflow-run-result-block">
        <div className="workflow-run-pr-review-meta">
          <span className={`workflow-run-pr-review-action workflow-run-pr-review-action-${payload.action}`}>
            {formatPrReviewAction(payload.action)}
          </span>
          {payload.inlineCommentCount > 0 ? (
            <span className="settings-muted">
              {payload.inlineCommentCount} inline comment
              {payload.inlineCommentCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {payload.summary ? (
          <p className="workflow-run-result-summary">{payload.summary}</p>
        ) : null}
      </div>
    );
  }

  return null;
}

export function buildWorkflowRunSummary(input: {
  runId: string;
  summary: WorkflowRunSummary | null;
  workflowName?: string | null;
  workflowId?: string | null;
  isStreaming: boolean;
  error: string | null;
}): WorkflowRunSummary {
  if (input.summary) {
    return {
      ...input.summary,
      workflowName: input.summary.workflowName ?? input.workflowName ?? null,
      workflowId: input.summary.workflowId ?? input.workflowId ?? null,
      status: resolveDisplayStatus(input.summary, input.isStreaming, input.error),
      errorMessage: input.error ?? input.summary.errorMessage,
    };
  }

  return {
    id: input.runId,
    workflowId: input.workflowId ?? null,
    workflowName: input.workflowName ?? "Workflow run",
    triggerLabel: "Manual",
    event: "manual",
    provider: "github",
    prNumber: 0,
    status: input.isStreaming ? "running" : input.error ? "failed" : "pending",
    errorMessage: input.error,
    iteration: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    durationMs: null,
    resolvedExecutor: "local",
    runnerKind: null,
  };
}

export function WorkflowRunSummaryDetail({
  run,
  error,
  isStreaming = false,
  timeline,
  onBack,
}: WorkflowRunSummaryDetailProps) {
  const detailQuery = useWorkflowRunQuery(run.id, { isStreaming });
  const detail = detailQuery.data?.run;
  const effectiveRun = detail ?? run;
  const resultMarkdown = detail?.resultMarkdown ?? null;
  const resultPayload = detail?.resultPayload ?? null;
  const hasStructuredPayload = resultPayload != null && resultPayload.kind !== "generic";

  const trigger =
    effectiveRun.prNumber > 0
      ? `PR #${effectiveRun.prNumber}: ${effectiveRun.triggerLabel}`
      : effectiveRun.triggerLabel;
  const resolvedError = error ?? effectiveRun.errorMessage;
  const displayStatus = resolveDisplayStatus(effectiveRun, isStreaming, resolvedError);
  const isRunActive =
    isStreaming || ACTIVE_WORKFLOW_RUN_STATUSES.has(effectiveRun.status);

  const [activeTab, setActiveTab] = useState<WorkflowRunDetailTab>(
    isRunActive ? "transcripts" : "summary",
  );

  useEffect(() => {
    setActiveTab(isRunActive ? "transcripts" : "summary");
  }, [run.id, isRunActive]);

  const tabItems = [
    { id: "transcripts" as const, label: "Live transcripts" },
    {
      id: "summary" as const,
      label: "Execution summary",
      hidden: isRunActive,
    },
  ];

  const effectiveTab: WorkflowRunDetailTab =
    isRunActive && activeTab === "summary" ? "transcripts" : activeTab;

  return (
    <div className="workflow-run-detail">
      {onBack ? (
        <button type="button" className="workflow-detail-back" onClick={onBack}>
          ← Runs
        </button>
      ) : null}

      <div className="workflow-run-detail-header">
        <div className="workflow-run-summary-intro">
          <h2 className="settings-panel-title">{effectiveRun.workflowName ?? "Workflow run"}</h2>
          <WorkflowRunStatusBadge status={displayStatus} live={isStreaming} />
        </div>

        <dl className="workflow-run-summary-details">
          <div>
            <dt>Trigger</dt>
            <dd>{trigger}</dd>
          </div>
          <div>
            <dt>Triggered</dt>
            <dd>{formatDate(effectiveRun.createdAt)}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              <WorkflowRunDuration
                durationMs={effectiveRun.durationMs}
                status={displayStatus}
                createdAt={effectiveRun.createdAt}
                live={isStreaming}
              />
            </dd>
          </div>
          {effectiveRun.iteration > 1 ? (
            <div>
              <dt>Iteration</dt>
              <dd>{effectiveRun.iteration}</dd>
            </div>
          ) : null}
        </dl>

        {resolvedError ? (
          <p className="settings-error workflow-run-summary-error">{resolvedError}</p>
        ) : null}

        {isStreaming ? (
          <p className="settings-muted workflow-run-summary-note">
            {workflowRunActiveNote(effectiveRun)}
          </p>
        ) : null}

        <SettingsTabs
          variant="pill"
          className="workflow-run-detail-tabs"
          value={effectiveTab}
          onChange={setActiveTab}
          ariaLabel="Workflow run sections"
          items={tabItems}
        />
      </div>

      <div className="workflow-run-detail-body">
        {effectiveTab === "transcripts" ? (
          <WorkflowRunTranscriptPanel
            runId={run.id}
            timeline={timeline}
            isStreaming={isStreaming}
            isRunActive={isRunActive}
          />
        ) : null}

        {effectiveTab === "summary" && (resultMarkdown || hasStructuredPayload) ? (
          <section className="workflow-run-result workflow-run-detail-summary" aria-label="Workflow result">
            {resultMarkdown ? (
              <div className="workflow-run-result-markdown">
                <MarkdownContent content={resultMarkdown} />
              </div>
            ) : null}
            {hasStructuredPayload && resultPayload ? (
              <div className="workflow-run-result-structured">
                <WorkflowRunResultPayloadView payload={resultPayload} />
              </div>
            ) : null}
          </section>
        ) : null}

        {effectiveTab === "summary" && !resultMarkdown && !hasStructuredPayload ? (
          <p className="settings-muted workflow-run-summary-note">No execution summary available.</p>
        ) : null}
      </div>
    </div>
  );
}
