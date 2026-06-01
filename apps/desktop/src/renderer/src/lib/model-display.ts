import type { HarnessModelInfo } from "../../../preload/api";

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

export function formatModelInfo(model: HarnessModelInfo): ModelDisplayParts {
  if (model.name?.trim()) {
    return { primary: model.name.trim() };
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
  return { provider, id, name, contextWindow, reasoning };
}

export function isMaxThinkingLevel(level: string | undefined): boolean {
  return level === "high" || level === "xhigh";
}

export function maxThinkingLevelForModel(model: HarnessModelInfo | null): "high" | "xhigh" {
  const id = model?.id.toLowerCase() ?? "";
  if (id.includes("codex") && id.includes("max")) return "xhigh";
  return "high";
}

type SwitcherSlot = {
  display: ModelDisplayParts;
  matches: (model: HarnessModelInfo) => boolean;
};

/** Curated switcher rows (matched against Pi's available models, in order). */
const MODEL_SWITCHER_SLOTS: SwitcherSlot[] = [
  {
    display: { primary: "Composer 2.5", secondary: "Fast" },
    matches: (m) => /composer/i.test(m.id),
  },
  {
    display: { primary: "Opus 4.8", secondary: "High" },
    matches: (m) => /opus/i.test(m.id) && /4[._-]?8/.test(m.id),
  },
  {
    display: { primary: "GPT-5.5", secondary: "Medium" },
    matches: (m) => /gpt-5[._-]?5|gpt-5\.5/i.test(m.id),
  },
  {
    display: { primary: "Sonnet 4.6", secondary: "Medium" },
    matches: (m) => /sonnet/i.test(m.id) && /4[._-]?6/.test(m.id),
  },
  {
    display: { primary: "Codex 5.3", secondary: "Medium" },
    matches: (m) => /codex/i.test(m.id) && /5[._-]?3/.test(m.id),
  },
];

export type SwitcherModel = HarnessModelInfo & {
  display: ModelDisplayParts;
};

/** Pick up to five curated models from Pi's full available list. */
export function pickSwitcherModels(available: HarnessModelInfo[]): SwitcherModel[] {
  const used = new Set<string>();
  const result: SwitcherModel[] = [];

  for (const slot of MODEL_SWITCHER_SLOTS) {
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
