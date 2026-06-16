import type { ConversationSummary } from "../../../preload/api";

/** Keep sidebar order stable during background streaming; only promote on real user activity. */
export function mergeConversationOrder(
  previous: ConversationSummary[],
  incoming: ConversationSummary[],
): ConversationSummary[] {
  const incomingById = new Map(incoming.map((c) => [c.sessionId, c]));

  if (previous.length === 0) {
    return [...incoming].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  const promoted: ConversationSummary[] = [];
  const stable: ConversationSummary[] = [];

  for (const prev of previous) {
    const next = incomingById.get(prev.sessionId);
    if (!next) continue;
    incomingById.delete(prev.sessionId);

    const prevTime = new Date(prev.updatedAt).getTime();
    const nextTime = new Date(next.updatedAt).getTime();
    if (nextTime > prevTime) {
      promoted.push(next);
    } else {
      stable.push(next);
    }
  }

  const brandNew = [...incomingById.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  promoted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return [...brandNew, ...promoted, ...stable];
}
