import type { Database } from "@openharness/db";
import {
  isCronDue,
  minuteKeyForDate,
  scheduleDeliveryId,
} from "./workflow-cron.js";
import type { SourceControlProvider } from "@openharness/db/schema";
import { insertWorkflowRun, listEnabledWorkflowsWithSchedules } from "./workflow-db.js";
import type { WorkflowScheduleTrigger } from "./workflow-types.js";
import { runBackgroundTick } from "../result-helpers.js";

const TICK_MS = 60_000;

export type SchedulerTickSummary = {
  workflowsChecked: number;
  triggersChecked: number;
  enqueued: number;
  skippedDuplicate: number;
};

export function startWorkflowScheduler(db: Database): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    await runBackgroundTick("[workflow-scheduler]", async () => {
      await runSchedulerTick(db);
    });
    running = false;
  };

  void tick();
  const timer = setInterval(() => void tick(), TICK_MS);
  return () => clearInterval(timer);
}

export async function runSchedulerTick(db: Database): Promise<SchedulerTickSummary> {
  const now = new Date();
  const workflows = await listEnabledWorkflowsWithSchedules(db);

  const summary: SchedulerTickSummary = {
    workflowsChecked: workflows.length,
    triggersChecked: 0,
    enqueued: 0,
    skippedDuplicate: 0,
  };

  for (const workflowRecord of workflows) {
    if (!workflowRecord.targetBranch.trim()) continue;

    const scheduleTriggers = workflowRecord.triggers.filter(
      (trigger): trigger is WorkflowScheduleTrigger => trigger.kind === "schedule",
    );

    for (const trigger of scheduleTriggers) {
      summary.triggersChecked += 1;
      if (!isCronDue(trigger.cronExpression, trigger.timezone, now)) continue;

      const minuteKey = minuteKeyForDate(now, trigger.timezone);
      const deliveryId = scheduleDeliveryId(workflowRecord.id, trigger.id, minuteKey);

      const result = await insertWorkflowRun(db, {
        organizationId: workflowRecord.organizationId,
        userId: workflowRecord.userId,
        workflowId: workflowRecord.id,
        workflowType: null,
        projectSourceControlConnectionId: workflowRecord.connectionId,
        connectionId: workflowRecord.sourceConnectionId ?? workflowRecord.connectionId,
        provider: (workflowRecord.provider ?? "github") as SourceControlProvider,
        namespace: workflowRecord.owner,
        repoName: workflowRecord.repo,
        prNumber: 0,
        event: "schedule",
        deliveryId,
        iteration: 1,
        payload: {
          branch: workflowRecord.targetBranch,
          triggerId: trigger.id,
          scheduledAt: now.toISOString(),
          workflow: {
            id: workflowRecord.id,
            name: workflowRecord.name,
            model: workflowRecord.model,
            instructions: workflowRecord.instructions,
            tools: workflowRecord.tools,
            triggerLabel: trigger.label ?? trigger.preset ?? "custom",
          },
        },
      });

      if (result.inserted) {
        summary.enqueued += 1;
      } else {
        summary.skippedDuplicate += 1;
      }
    }
  }

  return summary;
}
