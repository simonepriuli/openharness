export type AttachedRootKind = "file" | "folder";

export type AttachedRoot = {
  id: string;
  absolutePath: string;
  kind: AttachedRootKind;
  label: string;
};

function normalizePathForCompare(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function dedupeAttachedRoots(roots: AttachedRoot[]): AttachedRoot[] {
  const seen = new Set<string>();
  const deduped: AttachedRoot[] = [];
  for (const root of roots) {
    const key = normalizePathForCompare(root.absolutePath);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(root);
  }
  return deduped;
}

export function grantsToSessionPayload(grants: AttachedRoot[]): AttachedRoot[] {
  return dedupeAttachedRoots(grants).map((grant) => ({
    id: grant.id,
    absolutePath: grant.absolutePath,
    kind: grant.kind,
    label: grant.label,
  }));
}
