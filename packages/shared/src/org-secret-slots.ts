export const CURATED_CLOUD_PROVIDER_SLOTS = [
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "groq",
  "mistral",
  "deepseek",
] as const;

export type CuratedCloudProviderSlot = (typeof CURATED_CLOUD_PROVIDER_SLOTS)[number];

export const ORG_SECRET_SLOT_EXA = "exa" as const;
export const ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT = "openrouter_management" as const;

export const ORG_SECRET_SLOTS = [
  ...CURATED_CLOUD_PROVIDER_SLOTS,
  ORG_SECRET_SLOT_EXA,
  ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT,
] as const;

export type OrgSecretSlot = (typeof ORG_SECRET_SLOTS)[number];

export const ORG_SECRET_SLOT_DISPLAY_NAMES: Record<OrgSecretSlot, string> = {
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  groq: "Groq",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  exa: "Exa (web search)",
  openrouter_management: "OpenRouter management key",
};

const ORG_SECRET_SLOT_SET = new Set<string>(ORG_SECRET_SLOTS);

export function isOrgSecretSlot(value: string): value is OrgSecretSlot {
  return ORG_SECRET_SLOT_SET.has(value);
}

export function isCuratedCloudProviderSlot(value: string): value is CuratedCloudProviderSlot {
  return (CURATED_CLOUD_PROVIDER_SLOTS as readonly string[]).includes(value);
}

export function maskSecretValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) {
    return "••••";
  }
  return `••••••••${trimmed.slice(-4)}`;
}
