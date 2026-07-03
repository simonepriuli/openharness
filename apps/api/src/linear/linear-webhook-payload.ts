export function extractProjectId(payload: Record<string, unknown>): string | null {
  const data = payload.data;
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;

  if (typeof row.projectId === "string" && row.projectId.length > 0) return row.projectId;
  if (row.project && typeof row.project === "object") {
    const project = row.project as { id?: string | null };
    if (typeof project.id === "string" && project.id.length > 0) return project.id;
  }

  return null;
}

export function issueIdFromPayload(
  dataRow: Record<string, unknown> | null,
  options?: { resourceType?: string },
): string | null {
  if (!dataRow) return null;
  if (options?.resourceType === "Comment") {
    if (typeof dataRow.issueId === "string" && dataRow.issueId.length > 0) {
      return dataRow.issueId;
    }
    return null;
  }
  if (typeof dataRow.id === "string" && dataRow.id.length > 0) return dataRow.id;
  if (typeof dataRow.issueId === "string" && dataRow.issueId.length > 0) return dataRow.issueId;
  return null;
}
