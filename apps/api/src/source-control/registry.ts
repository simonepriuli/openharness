import type { SourceControlProvider } from "@openharness/db/schema";
import type { SourceControlProviderAdapter } from "./types.js";

const adapters = new Map<SourceControlProvider, SourceControlProviderAdapter>();

export function registerSourceControlProvider(adapter: SourceControlProviderAdapter): void {
  adapters.set(adapter.provider, adapter);
}

export function getSourceControlProvider(
  provider: SourceControlProvider,
): SourceControlProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`Source control provider not registered: ${provider}`);
  }
  return adapter;
}

export function listSourceControlProviders(): SourceControlProvider[] {
  return [...adapters.keys()];
}
