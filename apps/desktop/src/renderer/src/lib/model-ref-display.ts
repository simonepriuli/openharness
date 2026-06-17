import type { HarnessModelInfo } from "../../../preload/api";

export type DisplayModelOption = {
  value: string;
  provider: string;
  providerLabel: string;
  lab: string;
  modelName: string;
  /** Show vendor/routing line between provider and model (e.g. OpenRouter upstream). */
  showLab: boolean;
  isFree: boolean;
  searchText: string;
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  groq: "Groq",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  cursorapi: "API for Cursor",
  "local-openai": "Custom server",
  "amazon-bedrock": "Amazon Bedrock",
  fireworks: "Fireworks",
  together: "Together AI",
  xai: "xAI",
};

function titleCaseSegment(segment: string): string {
  if (!segment) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function formatProviderDisplayName(provider: string): string {
  const trimmed = provider.trim();
  if (!trimmed) return "Model";
  return PROVIDER_DISPLAY_NAMES[trimmed] ?? titleCaseSegment(trimmed);
}

export function modelRefFromParts(provider: string, id: string): string {
  return `${provider}/${id}`;
}

export function formatModelRefLabel(option: DisplayModelOption): string {
  const freeSuffix = option.isFree ? " (Free)" : "";
  if (option.showLab) {
    return `${option.providerLabel} / ${option.lab} / ${option.modelName}${freeSuffix}`;
  }
  return `${option.providerLabel} / ${option.modelName}${freeSuffix}`;
}

function buildSearchText(parts: string[]): string {
  return parts.join(" ").toLowerCase();
}

export function toDisplayModelOptionFromInfo(model: HarnessModelInfo): DisplayModelOption {
  const value = modelRefFromParts(model.provider, model.id);
  const isFree = model.id.toLowerCase().endsWith(":free");
  const provider = model.provider;
  const providerLabel = formatProviderDisplayName(provider);

  if (provider === "openrouter") {
    const slashIndex = model.id.indexOf("/");
    if (slashIndex > 0 && slashIndex < model.id.length - 1) {
      const lab = model.id.slice(0, slashIndex);
      const modelName = model.id.slice(slashIndex + 1);
      return {
        value,
        provider,
        providerLabel,
        lab,
        modelName,
        showLab: true,
        isFree,
        searchText: buildSearchText([value, provider, providerLabel, lab, modelName]),
      };
    }
  }

  const modelName = model.name?.trim() || model.id;
  return {
    value,
    provider,
    providerLabel,
    lab: provider,
    modelName,
    showLab: false,
    isFree,
    searchText: buildSearchText([value, provider, providerLabel, modelName]),
  };
}

export function toDisplayModelOption(value: string): DisplayModelOption {
  const trimmed = value.trim();
  const isFree = trimmed.toLowerCase().endsWith(":free");
  const withoutFree = isFree ? trimmed.slice(0, -5) : trimmed;
  const firstSlash = withoutFree.indexOf("/");
  const provider = firstSlash > 0 ? withoutFree.slice(0, firstSlash) : "model";
  const rest =
    firstSlash > 0 && firstSlash < withoutFree.length - 1
      ? withoutFree.slice(firstSlash + 1)
      : withoutFree;
  const providerLabel = formatProviderDisplayName(provider);

  if (provider === "openrouter") {
    const slashIndex = rest.indexOf("/");
    if (slashIndex > 0 && slashIndex < rest.length - 1) {
      const lab = rest.slice(0, slashIndex);
      const modelName = rest.slice(slashIndex + 1);
      return {
        value: trimmed,
        provider,
        providerLabel,
        lab,
        modelName,
        showLab: true,
        isFree,
        searchText: buildSearchText([trimmed, provider, providerLabel, lab, modelName]),
      };
    }
  }

  return {
    value: trimmed,
    provider,
    providerLabel,
    lab: provider,
    modelName: rest,
    showLab: false,
    isFree,
    searchText: buildSearchText([trimmed, provider, providerLabel, rest]),
  };
}

export function resolveDisplayModelOption(
  ref: string,
  modelByRef?: ReadonlyMap<string, HarnessModelInfo>,
): DisplayModelOption {
  const info = modelByRef?.get(ref.trim());
  return info ? toDisplayModelOptionFromInfo(info) : toDisplayModelOption(ref);
}
