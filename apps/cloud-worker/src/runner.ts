import { Result } from "better-result";
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
import { bestEffortAsync } from "./best-effort.js";
import type { CloudWorkerConfig } from "./config.js";
import { executeCloudRun } from "./execute-cloud-run.js";
import { executeCloudLinearAgentRun } from "./execute-cloud-linear-agent-run.js";
import { wrapInfrastructureError } from "./result-helpers.js";

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
    const runsResult = await Result.tryPromise({
      try: () =>
        listActiveCloudRunsForWorker({
          baseUrl: this.config.apiUrl,
          secret: this.config.secret,
          runnerInstanceId: this.config.workerId,
        }),
      catch: (cause) => cause,
    });

    if (Result.isError(runsResult)) {
      if (this.abortController?.signal.aborted) return reconciled;
      console.error(
        "[cloud-worker] stale run reconciliation failed",
        formatFetchError(runsResult.error, this.config.apiUrl),
      );
      return reconciled;
    }

    for (const run of runsResult.value) {
      if (this.executingRunId === run.id) continue;
      if (this.queue.some((queued) => queued.id === run.id)) continue;

      await bestEffortAsync("reconcile stale run", () =>
        this.createApiClient(run.organizationId).updateStatus(run.id, "failed", {
          errorMessage: STALE_RUN_ERROR_MESSAGE,
        }),
      );
      reconciled += 1;
      console.warn("[cloud-worker] reconciled stale run", run.id, run.status);
    }

    return reconciled;
  }

  async reconcileStaleLinearAgentRuns(): Promise<number> {
    if (!this.abortController) return 0;

    let reconciled = 0;
    const runsResult = await Result.tryPromise({
      try: () =>
        listActiveLinearAgentRunsForWorker({
          baseUrl: this.config.apiUrl,
          secret: this.config.secret,
          runnerInstanceId: this.config.workerId,
        }),
      catch: (cause) => cause,
    });

    if (Result.isError(runsResult)) {
      if (this.abortController?.signal.aborted) return reconciled;
      console.error(
        "[cloud-worker] stale linear agent run reconciliation failed",
        formatFetchError(runsResult.error, this.config.apiUrl),
      );
      return reconciled;
    }

    for (const run of runsResult.value) {
      if (this.executingAgentRunId === run.id) continue;
      if (this.agentQueue.some((queued) => queued.id === run.id)) continue;

      const api = createInternalLinearAgentRunApiClient({
        baseUrl: this.config.apiUrl,
        secret: this.config.secret,
        organizationId: run.organizationId,
      });
      await bestEffortAsync("reconcile stale linear agent run", () =>
        api.updateStatus(run.id, "failed", {
          errorMessage: STALE_RUN_ERROR_MESSAGE,
        }),
      );
      reconciled += 1;
      console.warn("[cloud-worker] reconciled stale linear agent run", run.id, run.status);
    }

    return reconciled;
  }

  private async pollPendingRuns(): Promise<void> {
    if (!this.abortController || this.polling) return;

    this.polling = true;
    const pollResult = await Result.tryPromise({
      try: async () => {
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
      },
      catch: (cause) => wrapInfrastructureError("poll pending runs", cause),
    });

    if (Result.isError(pollResult) && !this.abortController?.signal.aborted) {
      console.error(
        "[cloud-worker] poll error",
        formatFetchError(pollResult.error.cause, this.config.apiUrl),
      );
    }

    this.polling = false;
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const run = this.queue.shift();
      if (!run) continue;
      this.executingRunId = run.id;

      const result = await executeCloudRun(this.config, run);
      if (Result.isError(result)) {
        console.error("[cloud-worker] run failed", run.id, result.error.message);
      }

      if (this.executingRunId === run.id) {
        this.executingRunId = null;
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

      const result = await executeCloudLinearAgentRun(this.config, run);
      if (Result.isError(result)) {
        console.error("[cloud-worker] linear agent run failed", run.id, result.error.message);
      }

      if (this.executingAgentRunId === run.id) {
        this.executingAgentRunId = null;
      }
    }

    this.agentProcessing = false;
  }
}
