export type DisplayModelOption = {
  value: string;
  lab: string;
  modelName: string;
  isFree: boolean;
  searchText: string;
};

export function modelRefFromParts(provider: string, id: string): string {
  return `${provider}/${id}`;
}

export function formatModelRefLabel(option: DisplayModelOption): string {
  return `${option.lab}/${option.modelName}${option.isFree ? " (Free)" : ""}`;
}

export function toDisplayModelOption(value: string): DisplayModelOption {
  const trimmed = value.trim();
  const isFree = trimmed.toLowerCase().endsWith(":free");
  const withoutFree = isFree ? trimmed.slice(0, -5) : trimmed;

  if (withoutFree.toLowerCase().startsWith("openrouter/")) {
    const rest = withoutFree.slice("openrouter/".length);
    const slashIndex = rest.indexOf("/");
    if (slashIndex > 0 && slashIndex < rest.length - 1) {
      const lab = rest.slice(0, slashIndex);
      const modelName = rest.slice(slashIndex + 1);
      return {
        value: trimmed,
        lab,
        modelName,
        isFree,
        searchText: `${trimmed} ${lab} ${modelName}`.toLowerCase(),
      };
    }
  }

  const slashIndex = withoutFree.indexOf("/");
  const lab = slashIndex > 0 ? withoutFree.slice(0, slashIndex) : "model";
  const modelName =
    slashIndex > 0 && slashIndex < withoutFree.length - 1
      ? withoutFree.slice(slashIndex + 1)
      : withoutFree;
  return {
    value: trimmed,
    lab,
    modelName,
    isFree,
    searchText: `${trimmed} ${lab} ${modelName}`.toLowerCase(),
  };
}
