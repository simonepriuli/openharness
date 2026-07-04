import {
  createInternalWorkflowRunApiClient,
  createInternalLinearAgentRunApiClient,
  fetchPendingCloudRuns,
  fetchPendingLinearAgentRuns,
  listActiveCloudRunsForWorker,
  listActiveLinearAgentRunsForWorker,
  type PendingCloudWorkflowRun,
  type PendingLinearAgentRun,
} from "@openharness/workflow-executor";
import type { CloudWorkerConfig } from "./config.js";
import { executeCloudRun } from "./execute-cloud-run.js";
import { executeCloudLinearAgentRun } from "./execute-cloud-linear-agent-run.js";

const POLL_INTERVAL_MS = 5_000;
const STALE_RUN_ERROR_MESSAGE =
  "Run interrupted — the cloud worker restarted or exited before completion";

function formatFetchError(err: unknown, apiUrl: string): string {
  if (err instanceof Error) {
    const cause = err.cause as { code?: string } | undefined;
    if (cause?.code === "ECONNREFUSED") {
      return `cannot connect to ${apiUrl} (is pnpm dev:api running?)`;
    }
    return err.message;
  }
  return String(err);
}

export class CloudWorkflowRunner {
  private abortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private processing = false;
  private queue: PendingCloudWorkflowRun[] = [];
  private agentQueue: PendingLinearAgentRun[] = [];
  private executingRunId: string | null = null;
  private executingAgentRunId: string | null = null;

  constructor(private readonly config: CloudWorkerConfig) {}

  start(): void {
    if (this.abortController) return;
    this.abortController = new AbortController();
    void this.reconcileStaleRuns();
    void this.reconcileStaleLinearAgentRuns();
    void this.pollPendingRuns();
    this.pollTimer = setInterval(() => void this.pollPendingRuns(), POLL_INTERVAL_MS);
    console.log("[cloud-worker] started", { workerId: this.config.workerId });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;
    console.log("[cloud-worker] stopped");
  }

  private createApiClient(organizationId: string) {
    return createInternalWorkflowRunApiClient({
      baseUrl: this.config.apiUrl,
      secret: this.config.secret,
      organizationId,
    });
  }

  async reconcileStaleRuns(): Promise<number> {
    if (!this.abortController) return 0;

    let reconciled = 0;
    try {
      const runs = await listActiveCloudRunsForWorker({
        baseUrl: this.config.apiUrl,
        secret: this.config.secret,
        runnerInstanceId: this.config.workerId,
      });

      for (const run of runs) {
        if (this.executingRunId === run.id) continue;
        if (this.queue.some((queued) => queued.id === run.id)) continue;

        await this.createApiClient(run.organizationId).updateStatus(run.id, "failed", {
          errorMessage: STALE_RUN_ERROR_MESSAGE,
        });
        reconciled += 1;
        console.warn("[cloud-worker] reconciled stale run", run.id, run.status);
      }
    } catch (err) {
      if (this.abortController?.signal.aborted) return reconciled;
      console.error(
        "[cloud-worker] stale run reconciliation failed",
        formatFetchError(err, this.config.apiUrl),
      );
    }

    return reconciled;
  }

  async reconcileStaleLinearAgentRuns(): Promise<number> {
    if (!this.abortController) return 0;

    let reconciled = 0;
    try {
      const runs = await listActiveLinearAgentRunsForWorker({
        baseUrl: this.config.apiUrl,
        secret: this.config.secret,
        runnerInstanceId: this.config.workerId,
      });

      for (const run of runs) {
        if (this.executingAgentRunId === run.id) continue;
        if (this.agentQueue.some((queued) => queued.id === run.id)) continue;

        const api = createInternalLinearAgentRunApiClient({
          baseUrl: this.config.apiUrl,
          secret: this.config.secret,
          organizationId: run.organizationId,
        });
        await api.updateStatus(run.id, "failed", {
          errorMessage: STALE_RUN_ERROR_MESSAGE,
        });
        reconciled += 1;
        console.warn("[cloud-worker] reconciled stale linear agent run", run.id, run.status);
      }
    } catch (err) {
      if (this.abortController?.signal.aborted) return reconciled;
      console.error(
        "[cloud-worker] stale linear agent run reconciliation failed",
        formatFetchError(err, this.config.apiUrl),
      );
    }

    return reconciled;
  }

  private async pollPendingRuns(): Promise<void> {
    if (!this.abortController || this.polling) return;

    this.polling = true;
    try {
      await this.reconcileStaleRuns();
      await this.reconcileStaleLinearAgentRuns();
      const runs = await fetchPendingCloudRuns({
        baseUrl: this.config.apiUrl,
        secret: this.config.secret,
      });
      const agentRuns = await fetchPendingLinearAgentRuns({
        baseUrl: this.config.apiUrl,
        secret: this.config.secret,
      });

      for (const run of runs) {
        if (this.executingRunId === run.id) continue;
        if (this.queue.some((queued) => queued.id === run.id)) continue;
        this.queue.push(run);
      }

      for (const run of agentRuns) {
        if (this.executingAgentRunId === run.id) continue;
        if (this.agentQueue.some((queued) => queued.id === run.id)) continue;
        this.agentQueue.push(run);
      }

      void this.processQueue();
      void this.processAgentQueue();
    } catch (err) {
      if (this.abortController?.signal.aborted) return;
      console.error("[cloud-worker] poll error", formatFetchError(err, this.config.apiUrl));
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
      try {
        await executeCloudRun(this.config, run);
      } catch (err) {
        console.error("[cloud-worker] run failed", run.id, err);
      } finally {
        if (this.executingRunId === run.id) {
          this.executingRunId = null;
        }
      }
    }

    this.processing = false;
  }

  private agentProcessing = false;

  private async processAgentQueue(): Promise<void> {
    if (this.agentProcessing) return;
    this.agentProcessing = true;

    while (this.agentQueue.length > 0) {
      const run = this.agentQueue.shift();
      if (!run) continue;
      this.executingAgentRunId = run.id;
      try {
        await executeCloudLinearAgentRun(this.config, run);
      } catch (err) {
        console.error("[cloud-worker] linear agent run failed", run.id, err);
      } finally {
        if (this.executingAgentRunId === run.id) {
          this.executingAgentRunId = null;
        }
      }
    }

    this.agentProcessing = false;
  }
}
