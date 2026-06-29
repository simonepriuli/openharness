import { isOrgSecretSlot } from "./org-secret-slots.js";

export const REPO_ENV_KEY_MAX_LENGTH = 64;
export const REPO_ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export type RepoEnvKeyValidationError =
  | "EMPTY"
  | "TOO_LONG"
  | "INVALID_FORMAT"
  | "RESERVED";

export function isReservedRepoEnvKey(key: string): boolean {
  if (key.startsWith("OPENHARNESS_")) return true;
  if (isOrgSecretSlot(key.toLowerCase())) return true;
  return false;
}

export function validateRepoEnvKey(
  key: string,
): { ok: true; normalized: string } | { ok: false; error: RepoEnvKeyValidationError } {
  const normalized = key.trim();
  if (!normalized) {
    return { ok: false, error: "EMPTY" };
  }
  if (normalized.length > REPO_ENV_KEY_MAX_LENGTH) {
    return { ok: false, error: "TOO_LONG" };
  }
  if (!REPO_ENV_KEY_PATTERN.test(normalized)) {
    return { ok: false, error: "INVALID_FORMAT" };
  }
  if (isReservedRepoEnvKey(normalized)) {
    return { ok: false, error: "RESERVED" };
  }
  return { ok: true, normalized };
}

export function repoEnvKeyErrorMessage(error: RepoEnvKeyValidationError): string {
  switch (error) {
    case "EMPTY":
      return "Variable name is required";
    case "TOO_LONG":
      return `Variable name must be at most ${REPO_ENV_KEY_MAX_LENGTH} characters`;
    case "INVALID_FORMAT":
      return "Variable name must use UPPER_SNAKE_CASE (letters, numbers, underscores)";
    case "RESERVED":
      return "This variable name is reserved";
  }
}
