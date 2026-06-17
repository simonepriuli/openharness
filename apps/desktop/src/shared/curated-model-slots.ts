import { parseModelRef } from "./model-ref.js";

export type ModelIdentity = {
  provider: string;
  modelId: string;
};

export type CuratedModelSlot = {
  id: string;
  matches: (model: ModelIdentity) => boolean;
};

/** Curated switcher rows (matched against Pi's available models, in order). */
export const CURATED_MODEL_SLOTS: CuratedModelSlot[] = [
  {
    id: "composer-2.5",
    matches: (m) => /composer/i.test(m.modelId),
  },
  {
    id: "opus-4.8",
    matches: (m) => /opus/i.test(m.modelId) && /4[._-]?8/.test(m.modelId),
  },
  {
    id: "gpt-5.5",
    matches: (m) => /gpt-5[._-]?5|gpt-5\.5/i.test(m.modelId),
  },
  {
    id: "sonnet-4.6",
    matches: (m) => /sonnet/i.test(m.modelId) && /4[._-]?6/.test(m.modelId),
  },
  {
    id: "kimi-k2.6",
    matches: (m) => /kimi/i.test(m.modelId) && /k2(?:[._-]?6|p6)/i.test(m.modelId),
  },
  {
    id: "kimi-k2.7",
    matches: (m) =>
      (m.provider === "kimi-coding" && /^k2p7$/i.test(m.modelId)) ||
      (/kimi/i.test(m.modelId) &&
        /k2(?:[._-]?7|p7)/i.test(m.modelId) &&
        /code|p7/i.test(m.modelId)),
  },
  {
    id: "codex-5.3",
    matches: (m) => /codex/i.test(m.modelId) && /5[._-]?3/.test(m.modelId),
  },
];

export function modelMatchesCuratedSlot(ref: string, slot: CuratedModelSlot): boolean {
  const parsed = parseModelRef(ref);
  if (!parsed) return false;
  return slot.matches(parsed);
}

/** Find the first curated-slot match from a list of model refs. */
export function findFirstCuratedModelRef(refs: string[]): string | null {
  for (const slot of CURATED_MODEL_SLOTS) {
    const match = refs.find((ref) => modelMatchesCuratedSlot(ref, slot));
    if (match) return match;
  }
  return null;
}
