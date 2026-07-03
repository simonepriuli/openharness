import { existsSync } from "node:fs";
import type { BrowserWindow } from "electron";
import { executeWorkflowRun, extractWorkflowConfig } from "@openharness/workflow-executor";
import {
  claimWorkflowRun,
  fetchActiveWorkflowRunsForRunner,
  fetchPendingWorkflowRuns,
  listOrgGithubConnections,
  OpenHarnessApiError,
  updateWorkflowRunStatus,
  upsertRunnerBinding,
  type WorkflowRunPayload,
} from "./openharness-api.js";
import { getGitRemoteInfo } from "./git-remote.js";
import { getWorkflowRunnerInstanceId } from "./runner-instance.js";
import { appStore } from "./store.js";
import { createDesktopWorkflowExecutorDeps } from "./workflow-executor-adapters.js";
import { isGitRepository } from "./workflow-git.js";

const MAX_WORKFLOW_ITERATIONS = 5;
const POLL_INTERVAL_MS = 5_000;
const AUTH_POLL_BACKOFF_MS = 15_000;
const STALE_RUN_ERROR_MESSAGE =
  "Run interrupted — the workflow runner restarted or exited before completion";

type WorkflowRunEvent = WorkflowRunPayload & { id: string };

type WorkflowRunUpdateNotification = {
  runId: string;
  workflowId: string | null;
  title: string;
  messages: unknown[];
  streaming: boolean;
};

function workflowRunTitle(
  run: WorkflowRunEvent,
  workflowConfig: ReturnType<typeof extractWorkflowConfig>,
): string {
  return (
    workflowConfig?.name ??
    (run.event === "teams_mention"
      ? "Teams bug triage"
      : run.event === "discord_mention"
        ? "Discord bug triage"
        : run.event === "schedule"
          ? "Scheduled workflow"
          : run.prNumber > 0
            ? `PR #${run.prNumber}`
            : "Workflow")
  );
}

export class WorkflowRunner {
  private window: BrowserWindow | null = null;
  private abortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private pollBackoffUntil = 0;
  private processing = false;
  private queue: WorkflowRunEvent[] = [];
  private executingRunId: string | null = null;
  private rendererReady = false;
  private activeRuns = new Map<string, WorkflowRunUpdateNotification>();
  private activityChangeListener: (() => void) | null = null;

  setWindow(window: BrowserWindow | null): void {
    this.window = window;
  }

  setRendererReady(ready: boolean): void {
    this.rendererReady = ready;
    if (ready) {
      this.syncRunsToRenderer();
    }
  }

  setActivityChangeListener(listener: (() => void) | null): void {
    this.activityChangeListener = listener;
  }

  isBusy(): boolean {
    return this.executingRunId !== null || this.queue.length > 0 || this.processing;
  }

  private notifyActivityChange(): void {
    this.activityChangeListener?.();
  }

  start(): void {
    if (this.abortController) return;
    this.abortController = new AbortController();
    void this.initializeBindings();
    void this.pollPendingRuns();
    this.pollTimer = setInterval(() => void this.pollPendingRuns(), POLL_INTERVAL_MS);
  }

  async reconcileStaleRuns(): Promise<number> {
    if (!this.abortController) return 0;
    if (this.isBusy()) return 0;

    const instanceId = this.getInstanceId();
    let reconciled = 0;

    try {
      const { runs } = await fetchActiveWorkflowRunsForRunner(instanceId);
      for (const run of runs) {
        if (this.executingRunId === run.id) continue;
        if (this.queue.some((queuedRun) => queuedRun.id === run.id)) continue;

        await updateWorkflowRunStatus(run.id, "failed", {
          errorMessage: STALE_RUN_ERROR_MESSAGE,
        });
        this.activeRuns.delete(run.id);
        reconciled += 1;
        console.warn("[workflow-runner] reconciled stale run", run.id, run.status);
      }
      if (reconciled > 0) {
        this.notifyActivityChange();
      }
    } catch (err) {
      if (this.abortController?.signal.aborted) return reconciled;
      if (err instanceof OpenHarnessApiError && err.status === 401) return reconciled;
      console.error("[workflow-runner] stale run reconciliation failed", err);
    }

    return reconciled;
  }

  private async initializeBindings(): Promise<void> {
    try {
      await this.autoBackfillBindings(this.getInstanceId());
    } catch (err) {
      console.error("[workflow-runner] failed to initialize bindings", err);
    }
  }

  private async autoBackfillBindings(instanceId: string): Promise<void> {
    const { connections } = await listOrgGithubConnections();
    if (connections.length === 0) return;

    const recent = appStore.get("recentProjectCwds") ?? [];
    const lastCwd = appStore.get("lastCwd");
    const paths = [...new Set([...recent, lastCwd].filter((value): value is string => Boolean(value)))];

    for (const projectPath of paths) {
      if (!existsSync(projectPath) || !(await isGitRepository(projectPath))) continue;
      const remote = await getGitRemoteInfo(projectPath);
      if (!remote.namespace || !remote.repo || !remote.provider) continue;

      const connection = connections.find(
        (row) =>
          (row.provider ?? "github") === remote.provider &&
          row.githubOwner.toLowerCase() === remote.namespace!.toLowerCase() &&
          row.githubRepo.toLowerCase() === remote.repo!.toLowerCase(),
      );
      if (!connection) continue;

      await upsertRunnerBinding({
        runnerInstanceId: instanceId,
        connectionId: connection.id,
        projectPath,
      });
    }
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
  }

  private getInstanceId(): string {
    return getWorkflowRunnerInstanceId();
  }

  private async pollPendingRuns(): Promise<void> {
    if (!this.abortController || this.polling) return;
    if (Date.now() < this.pollBackoffUntil) return;

    this.polling = true;
    try {
      await this.reconcileStaleRuns();
      const { runs } = await fetchPendingWorkflowRuns(this.getInstanceId());
      let queued = false;
      for (const run of runs) {
        if (this.executingRunId === run.id) continue;
        if (this.queue.some((queuedRun) => queuedRun.id === run.id)) continue;
        this.queue.push(run);
        queued = true;
      }
      if (queued) {
        this.notifyActivityChange();
      }
      void this.processQueue();
    } catch (err) {
      if (this.abortController?.signal.aborted) return;
      if (err instanceof OpenHarnessApiError && err.status === 401) {
        console.warn("[workflow-runner] poll unauthorized, backing off");
        this.pollBackoffUntil = Date.now() + AUTH_POLL_BACKOFF_MS;
        return;
      }
      console.error("[workflow-runner] poll error", err);
    } finally {
      this.polling = false;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const run = this.queue.shift();
      if (!run) continue;
      this.executingRunId = run.id;
      this.notifyActivityChange();
      try {
        await this.executeRun(run);
      } catch (err) {
        console.error("[workflow-runner] run failed", run.id, err);
      } finally {
        if (this.executingRunId === run.id) {
          this.executingRunId = null;
          this.notifyActivityChange();
        }
      }
    }

    this.processing = false;
    this.notifyActivityChange();
  }

  private async executeRun(run: WorkflowRunEvent): Promise<void> {
    const instanceId = this.getInstanceId();
    const claimed = await claimWorkflowRun(run.id, instanceId, instanceId).catch((err) => {
      if (err instanceof OpenHarnessApiError && err.status === 409) return null;
      throw err;
    });
    if (!claimed) return;

    const claimedRun = claimed.run as {
      projectPath?: string | null;
      projectSourceControlConnectionId?: string;
    };
    const projectPath = claimedRun.projectPath ?? run.projectPath;
    if (!projectPath || !existsSync(projectPath) || !(await isGitRepository(projectPath))) {
      await updateWorkflowRunStatus(run.id, "failed", {
        errorMessage: "Connected project folder is missing or not a git repository",
      });
      return;
    }

    if (run.iteration > MAX_WORKFLOW_ITERATIONS) {
      await updateWorkflowRunStatus(run.id, "failed", {
        errorMessage: `Iteration cap (${MAX_WORKFLOW_ITERATIONS}) reached`,
      });
      return;
    }

    const workflowConfig = extractWorkflowConfig(run);
    const runId = run.id;
    const title = workflowRunTitle(run, workflowConfig);
    const connectionId =
      claimedRun.projectSourceControlConnectionId ?? run.projectSourceControlConnectionId;

    this.notifyRunUpdate({
      runId,
      workflowId: run.workflowId ?? workflowConfig?.id ?? null,
      title,
      messages: [],
      streaming: true,
    });

    const deps = createDesktopWorkflowExecutorDeps({
      projectPath,
      window: this.window,
      runId,
      connectionId,
    });

    try {
      await executeWorkflowRun(run.id, deps);
      this.notifyRunUpdate({
        runId,
        workflowId: run.workflowId ?? workflowConfig?.id ?? null,
        title,
        messages: deps.events.snapshotMessages(),
        streaming: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const partialMessages = deps.events.snapshotMessages();
      this.notifyRunUpdate({
        runId,
        workflowId: run.workflowId ?? workflowConfig?.id ?? null,
        title,
        messages:
          partialMessages.length > 0
            ? partialMessages
            : [{ role: "assistant", content: `Workflow failed: ${message}` }],
        streaming: false,
      });
    } finally {
      await deps.events.flush?.();
    }
  }

  private notifyRunUpdate(options: WorkflowRunUpdateNotification): void {
    this.activeRuns.set(options.runId, options);
    this.deliverRunUpdate(options);
  }

  private deliverRunUpdate(payload: WorkflowRunUpdateNotification): void {
    if (!this.rendererReady) return;
    this.window?.webContents.send("harness:workflow-run-update", payload);
  }

  syncRunsToRenderer(): void {
    for (const payload of this.activeRuns.values()) {
      this.deliverRunUpdate(payload);
    }
  }
}

let runner: WorkflowRunner | null = null;

export function getWorkflowRunner(): WorkflowRunner {
  if (!runner) {
    runner = new WorkflowRunner();
  }
  return runner;
}