export const DEFAULT_TITLE_MODEL_REF = "openrouter/google/gemma-4-31b-it:free";

export type ParsedModelRef = {
  provider: string;
  modelId: string;
};

/** Parse a model ref like "openrouter/moonshotai/kimi-k2.6" into provider + modelId. */
export function parseModelRef(modelRef: string): ParsedModelRef | null {
  const trimmed = modelRef.trim();
  if (!trimmed) {
    return parseModelRef(DEFAULT_TITLE_MODEL_REF);
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { provider: "openrouter", modelId: trimmed };
  }
  const provider = trimmed.slice(0, slash).trim();
  const modelId = trimmed.slice(slash + 1).trim();
  if (!provider || !modelId) return null;
  return { provider, modelId };
}
