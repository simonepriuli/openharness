import type { OrgSecretSlot } from "@openharness/shared/org-secret-slots";
import { maskSecretValue } from "@openharness/shared/org-secret-slots";

const cache = new Map<OrgSecretSlot, string>();

export function setOrgSecretCache(entries: Array<{ slot: OrgSecretSlot; value: string }>): void {
  cache.clear();
  for (const entry of entries) {
    cache.set(entry.slot, entry.value);
  }
}

export function clearOrgSecretCache(): void {
  cache.clear();
}

export function getOrgSecretValue(slot: OrgSecretSlot): string | null {
  const value = cache.get(slot)?.trim();
  return value || null;
}

export function getActiveOrgSecretSlots(): OrgSecretSlot[] {
  return [...cache.keys()];
}

export function isOrgSecretActive(slot: OrgSecretSlot): boolean {
  return cache.has(slot);
}

export function getOrgSecretMaskedHint(slot: OrgSecretSlot): string | undefined {
  const value = getOrgSecretValue(slot);
  return value ? maskSecretValue(value) : undefined;
}

export function hasAnyOrgSecretsConfigured(): boolean {
  return cache.size > 0;
}
