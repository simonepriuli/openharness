import type { HarnessModelInfo, ModelThinkingLevelMap, ThinkingLevel } from "../../../preload/api";
import { CURATED_MODEL_SLOTS } from "../../../shared/curated-model-slots";

export type ModelDisplayParts = {
  primary: string;
  secondary?: string;
};

function titleCaseSegment(segment: string): string {
  if (!segment) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

/** Split a model id into a display name and optional trailing descriptor. */
export function formatModelId(id: string): ModelDisplayParts {
  const parts = id.split(/[-_]/).filter(Boolean);
  if (parts.length <= 1) {
    return { primary: titleCaseSegment(id) };
  }

  const last = parts[parts.length - 1]!;
  const descriptorHints = new Set([
    "fast",
    "high",
    "medium",
    "low",
    "mini",
    "max",
    "pro",
    "flash",
    "turbo",
  ]);

  if (descriptorHints.has(last.toLowerCase()) && parts.length >= 2) {
    const nameParts = parts.slice(0, -1);
    return {
      primary: nameParts.map(titleCaseSegment).join(" "),
      secondary: titleCaseSegment(last),
    };
  }

  return { primary: parts.map(titleCaseSegment).join(" ") };
}

/** Strip Pi catalog prefixes like "OpenAI: " for compact UI labels. */
export function stripProviderFromModelName(name: string): string {
  const trimmed = name.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) return trimmed;
  const withoutPrefix = trimmed.slice(colonIndex + 1).trim();
  return withoutPrefix || trimmed;
}

export function formatModelInfo(model: HarnessModelInfo): ModelDisplayParts {
  if (model.name?.trim()) {
    return { primary: stripProviderFromModelName(model.name) };
  }
  return formatModelId(model.id);
}

export function modelKey(model: HarnessModelInfo): string {
  return `${model.provider}/${model.id}`;
}

export function parseModelFromState(raw: unknown): HarnessModelInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const provider = typeof record.provider === "string" ? record.provider : "";
  const id = typeof record.id === "string" ? record.id : "";
  if (!provider || !id) return null;
  const name = typeof record.name === "string" ? record.name : undefined;
  const contextWindow =
    typeof record.contextWindow === "number" && record.contextWindow > 0
      ? record.contextWindow
      : undefined;
  const reasoning = typeof record.reasoning === "boolean" ? record.reasoning : undefined;
  const thinkingLevelMap = parseThinkingLevelMap(record.thinkingLevelMap);
  return { provider, id, name, contextWindow, reasoning, thinkingLevelMap };
}

function parseThinkingLevelMap(raw: unknown): ModelThinkingLevelMap | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const levels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  const map: ModelThinkingLevelMap = {};
  let hasEntry = false;
  for (const level of levels) {
    if (!(level in record)) continue;
    const value = record[level];
    if (value === null) {
      map[level] = null;
      hasEntry = true;
      continue;
    }
    if (typeof value === "string") {
      map[level] = value;
      hasEntry = true;
    }
  }
  return hasEntry ? map : undefined;
}

/** Mirrors Pi's getSupportedThinkingLevels for a single level. */
export function thinkingLevelSupported(
  model: HarnessModelInfo,
  level: ThinkingLevel,
): boolean {
  if (model.reasoning === false) return level === "off";
  const mapped = model.thinkingLevelMap?.[level];
  if (mapped === null) return false;
  if (level === "xhigh") return mapped !== undefined;
  return true;
}

/** Models that cannot run with thinking off (metadata or known provider quirks). */
export function modelRequiresMaxThinking(model: HarnessModelInfo | null): boolean {
  if (!model || model.reasoning === false) return false;
  if (!thinkingLevelSupported(model, "off")) return true;
  if (model.provider === "kimi-coding") return true;
  if (
    model.provider === "openrouter" &&
    /(?:^|\/)moonshotai\/kimi|kimi-k/i.test(model.id)
  ) {
    return true;
  }
  return false;
}

export function isMaxThinkingLevel(level: string | undefined): boolean {
  return level === "high" || level === "xhigh";
}

export function maxThinkingLevelForModel(model: HarnessModelInfo | null): "high" | "xhigh" {
  const id = model?.id.toLowerCase() ?? "";
  if (id.includes("codex") && id.includes("max")) return "xhigh";
  return "high";
}

export type ModelSwitcherSlot = {
  id: string;
  display: ModelDisplayParts;
  matches: (model: HarnessModelInfo) => boolean;
};

const CURATED_SLOT_DISPLAY: Record<string, ModelDisplayParts> = {
  "composer-2.5": { primary: "Composer 2.5", secondary: "Fast" },
  "opus-4.8": { primary: "Opus 4.8", secondary: "High" },
  "gpt-5.5": { primary: "GPT-5.5", secondary: "Medium" },
  "sonnet-4.6": { primary: "Sonnet 4.6", secondary: "Medium" },
  "kimi-k2.6": { primary: "Kimi K2.6", secondary: "Medium" },
  "kimi-k2.7": { primary: "Kimi K2.7", secondary: "Code" },
  "codex-5.3": { primary: "Codex 5.3", secondary: "Medium" },
};

/** Curated switcher rows (matched against Pi's available models, in order). */
export const MODEL_SWITCHER_SLOTS: ModelSwitcherSlot[] = CURATED_MODEL_SLOTS.map((slot) => ({
  id: slot.id,
  display: CURATED_SLOT_DISPLAY[slot.id] ?? { primary: slot.id },
  matches: (model) => slot.matches({ provider: model.provider, modelId: model.id }),
}));

export const CHAT_MODEL_SELECTOR_MAX = 5;

function displayForModel(model: HarnessModelInfo): ModelDisplayParts {
  const slot = MODEL_SWITCHER_SLOTS.find((entry) => entry.matches(model));
  return slot?.display ?? formatModelInfo(model);
}

function findAvailableByRef(
  available: HarnessModelInfo[],
  ref: string,
  used: Set<string>,
): HarnessModelInfo | undefined {
  const normalized = ref.trim();
  if (!normalized) return undefined;
  return available.find((model) => !used.has(modelKey(model)) && modelKey(model) === normalized);
}

export function toSwitcherModel(model: HarnessModelInfo): SwitcherModel {
  return { ...model, display: displayForModel(model) };
}

export type SwitcherModel = HarnessModelInfo & {
  display: ModelDisplayParts;
};

/** Pick models for the chat switcher from pinned refs or curated defaults. */
export function pickSwitcherModels(
  available: HarnessModelInfo[],
  pinnedModelRefs?: readonly string[],
): SwitcherModel[] {
  if (pinnedModelRefs?.length) {
    const used = new Set<string>();
    const result: SwitcherModel[] = [];

    for (const ref of pinnedModelRefs.slice(0, CHAT_MODEL_SELECTOR_MAX)) {
      const match = findAvailableByRef(available, ref, used);
      if (!match) continue;
      used.add(modelKey(match));
      result.push(toSwitcherModel(match));
    }

    return result;
  }

  const slots = MODEL_SWITCHER_SLOTS;
  const used = new Set<string>();
  const result: SwitcherModel[] = [];

  for (const slot of slots) {
    const match = available.find((m) => !used.has(modelKey(m)) && slot.matches(m));
    if (!match) continue;
    used.add(modelKey(match));
    result.push({ ...match, display: slot.display });
  }

  if (result.length === 0 && available.length > 0) {
    return available.slice(0, 8).map((m) => ({
      ...m,
      display: formatModelInfo(m),
    }));
  }

  return result;
}
