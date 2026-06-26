export type SwarmWorkerStatus = "queued" | "running" | "done" | "error";

export interface SwarmWorkerState {
  index: number;
  status: SwarmWorkerStatus;
  action?: string;
  preview?: string;
  task: string;
}

export interface SwarmProgressPartialResult {
  content?: Array<{ type?: string; text?: string }>;
  details?: {
    model?: string;
    workers?: SwarmWorkerState[];
  };
}

export interface ParsedSwarmProgress {
  model?: string;
  workers: SwarmWorkerState[];
}

const SWARM_LINE_RE = /^Subagent\s+(\d+):\s*(\.\.\.|->|ok|xx)(?:\s+(.*))?$/i;

const STATUS_FROM_ICON: Record<string, SwarmWorkerStatus> = {
  "...": "queued",
  "->": "running",
  ok: "done",
  xx: "error",
};

export function truncateSwarmTaskTitle(task: string, maxLength = 70): string {
  const normalized = task.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

const KNOWN_SWARM_ACTIONS = new Set([
  "Starting…",
  "Reasoning",
  "Exploring files",
  "Running commands",
  "Editing files",
  "Searching the web",
  "Working",
]);

export function getSwarmWorkerStatusLabel(worker: SwarmWorkerState): string {
  const action = worker.action?.trim();
  if (action) return action;
  const legacyPreview = worker.preview?.trim();
  if (legacyPreview && KNOWN_SWARM_ACTIONS.has(legacyPreview)) return legacyPreview;
  return "Starting…";
}

export function parseSwarmWorkerProgress(
  partialResult: SwarmProgressPartialResult | undefined,
  fallbackTasks?: string[],
): ParsedSwarmProgress | undefined {
  if (!partialResult) return undefined;

  const model =
    typeof partialResult.details?.model === "string" && partialResult.details.model.trim()
      ? partialResult.details.model.trim()
      : undefined;

  const structured = partialResult.details?.workers;
  if (Array.isArray(structured) && structured.length > 0) {
    const workers = structured
      .map((worker, index) => normalizeWorker(worker, fallbackTasks, index))
      .filter((worker): worker is SwarmWorkerState => worker !== undefined);
    if (workers.length > 0) {
      return { model, workers };
    }
  }

  const text = partialResult.content?.find((part) => part.type === "text")?.text;
  if (!text?.trim()) return model ? { model, workers: [] } : undefined;

  const workers = parseSwarmProgressText(text, fallbackTasks);
  if (workers.length === 0) return model ? { model, workers: [] } : undefined;
  return { model, workers };
}

function normalizeWorker(
  worker: SwarmWorkerState,
  fallbackTasks: string[] | undefined,
  index: number,
): SwarmWorkerState | undefined {
  if (!worker || typeof worker !== "object") return undefined;
  const workerIndex = typeof worker.index === "number" ? worker.index : index;
  const status = normalizeSwarmStatus(worker.status);
  if (!status) return undefined;
  const task =
    typeof worker.task === "string" && worker.task.trim()
      ? worker.task.trim()
      : (fallbackTasks?.[workerIndex]?.trim() ?? "");
  const preview =
    typeof worker.preview === "string" && worker.preview.trim() ? worker.preview.trim() : undefined;
  const action =
    typeof worker.action === "string" && worker.action.trim() ? worker.action.trim() : undefined;
  return { index: workerIndex, status, preview, action, task };
}

function normalizeSwarmStatus(status: unknown): SwarmWorkerStatus | undefined {
  if (status === "queued" || status === "running" || status === "done" || status === "error") {
    return status;
  }
  return undefined;
}

function inferSwarmActionFromLegacyPreview(preview: string): string | undefined {
  const lower = preview.toLowerCase();
  if (lower.includes("reason") || lower.includes("think")) return "Reasoning";
  if (
    lower.includes("read") ||
    lower.includes("explor") ||
    lower.includes("search") ||
    lower.includes("file") ||
    lower.includes("grep") ||
    lower.includes("find")
  ) {
    return "Exploring files";
  }
  if (lower.includes("command") || lower.includes("bash") || lower.includes("run ")) {
    return "Running commands";
  }
  if (lower.includes("edit") || lower.includes("writ")) return "Editing files";
  return undefined;
}

function parseSwarmProgressText(text: string, fallbackTasks?: string[]): SwarmWorkerState[] {
  const workers: SwarmWorkerState[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(SWARM_LINE_RE);
    if (!match) continue;
    const index = Number(match[1]) - 1;
    if (!Number.isFinite(index) || index < 0) continue;
    const status = STATUS_FROM_ICON[match[2] ?? ""];
    if (!status) continue;
    const suffix = match[3]?.trim() || undefined;
    const action = suffix
      ? KNOWN_SWARM_ACTIONS.has(suffix)
        ? suffix
        : inferSwarmActionFromLegacyPreview(suffix)
      : undefined;
    const task = fallbackTasks?.[index]?.trim() ?? "";
    workers.push({ index, status, preview: suffix, action, task });
  }
  return workers;
}
