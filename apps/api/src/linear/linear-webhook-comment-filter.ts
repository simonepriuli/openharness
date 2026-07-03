const AUTOMATION_ACTOR_TYPES = new Set([
  "app",
  "application",
  "integration",
  "oauthapplication",
  "oauthclient",
]);

export function extractLinearWebhookActor(payload: Record<string, unknown>): {
  id: string | null;
  type: string | null;
} {
  const actor = payload.actor;
  if (!actor || typeof actor !== "object") {
    return { id: null, type: null };
  }
  const row = actor as { id?: unknown; type?: unknown };
  return {
    id: typeof row.id === "string" ? row.id : null,
    type: typeof row.type === "string" ? row.type : null,
  };
}

export function linearCommentAuthorUserId(
  dataRow: Record<string, unknown> | null,
): string | null {
  if (!dataRow) return null;
  return typeof dataRow.userId === "string" && dataRow.userId.length > 0
    ? dataRow.userId
    : null;
}

export function isNonUserLinearActor(actorType: string | null): boolean {
  if (!actorType) return false;
  const normalized = actorType.trim().toLowerCase();
  if (normalized === "user") return false;
  if (AUTOMATION_ACTOR_TYPES.has(normalized)) return true;
  return normalized.includes("oauth") || normalized.includes("integration");
}

/** True when the comment was created by this OpenHarness Linear app integration. */
export function isOpenHarnessAuthoredLinearComment(options: {
  actor: { id: string | null; type: string | null };
  commentAuthorUserId: string | null;
  appActorUserId: string | null;
}): boolean {
  if (isNonUserLinearActor(options.actor.type)) return true;

  const appActorUserId = options.appActorUserId?.trim();
  if (!appActorUserId) return false;

  if (options.commentAuthorUserId === appActorUserId) return true;
  if (options.actor.id === appActorUserId) return true;
  return false;
}
