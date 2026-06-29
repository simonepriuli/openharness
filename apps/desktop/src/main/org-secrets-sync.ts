import {
  isCuratedCloudProviderSlot,
  isOrgSecretSlot,
  ORG_SECRET_SLOT_EXA,
  ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT,
  type OrgSecretSlot,
} from "@openharness/shared/org-secret-slots";
import { resolveOrgSecrets, OpenHarnessApiError } from "./openharness-api.js";
import { clearExaApiKeyIgnoringOrg } from "./exa-config.js";
import {
  clearOrgSecretCache,
  getActiveOrgSecretSlots,
  setOrgSecretCache,
} from "./org-secrets-cache.js";
import { applyOrgSecretsToAuthFile, clearProviderApiKeyIgnoringOrg } from "./pi-auth.js";
import { clearOpenRouterManagementKeyIgnoringOrg } from "./openrouter-management.js";

export { getActiveOrgSecretSlots, isOrgSecretActive, hasAnyOrgSecretsConfigured } from "./org-secrets-cache.js";
export { getOrgSecretValue, getOrgSecretMaskedHint } from "./org-secrets-cache.js";

function clearLocalSecretForSlot(slot: OrgSecretSlot): void {
  if (isCuratedCloudProviderSlot(slot)) {
    clearProviderApiKeyIgnoringOrg(slot);
    return;
  }
  if (slot === ORG_SECRET_SLOT_EXA) {
    clearExaApiKeyIgnoringOrg();
    return;
  }
  if (slot === ORG_SECRET_SLOT_OPENROUTER_MANAGEMENT) {
    clearOpenRouterManagementKeyIgnoringOrg();
  }
}

function clearRemovedOrgSlotsFromLocal(
  previousSlots: readonly OrgSecretSlot[],
  nextSlots: ReadonlySet<OrgSecretSlot>,
): void {
  for (const slot of previousSlots) {
    if (!nextSlots.has(slot)) {
      clearLocalSecretForSlot(slot);
    }
  }
}

export async function syncOrgSecrets(): Promise<{ configuredCount: number }> {
  const previousSlots = getActiveOrgSecretSlots();

  try {
    const { secrets } = await resolveOrgSecrets();
    const configured = secrets.filter(
      (entry): entry is { slot: OrgSecretSlot; value: string } =>
        isOrgSecretSlot(entry.slot),
    );
    if (configured.length === 0) {
      clearRemovedOrgSlotsFromLocal(previousSlots, new Set());
      clearOrgSecretCache();
      return { configuredCount: 0 };
    }

    const nextSlots = new Set(configured.map((entry) => entry.slot));
    clearRemovedOrgSlotsFromLocal(previousSlots, nextSlots);

    for (const entry of configured) {
      clearLocalSecretForSlot(entry.slot);
    }
    setOrgSecretCache(configured);
    applyOrgSecretsToAuthFile();
    return { configuredCount: configured.length };
  } catch (err) {
    if (err instanceof OpenHarnessApiError && (err.status === 401 || err.status === 403)) {
      clearRemovedOrgSlotsFromLocal(previousSlots, new Set());
      clearOrgSecretCache();
      return { configuredCount: 0 };
    }
    throw err;
  }
}
