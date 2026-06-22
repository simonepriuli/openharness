export type ConnectionDedupeRow = {
  id: string;
  organizationId: string;
  installationId: string;
  githubOwner: string;
  githubRepo: string;
  createdAt: Date;
};

export function connectionRepoKey(row: ConnectionDedupeRow): string {
  return [
    row.organizationId,
    row.installationId,
    row.githubOwner.toLowerCase(),
    row.githubRepo.toLowerCase(),
  ].join(":");
}

export function planConnectionDedupe(
  connections: ConnectionDedupeRow[],
): Array<{ canonicalId: string; duplicateIds: string[] }> {
  const groups = new Map<string, ConnectionDedupeRow[]>();

  for (const row of connections) {
    const key = connectionRepoKey(row);
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const plans: Array<{ canonicalId: string; duplicateIds: string[] }> = [];
  for (const rows of groups.values()) {
    if (rows.length <= 1) continue;
    const sorted = [...rows].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    plans.push({
      canonicalId: sorted[0]!.id,
      duplicateIds: sorted.slice(1).map((row) => row.id),
    });
  }

  return plans;
}
