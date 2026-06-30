import type { AttachedRoot } from "../../../preload/api";
import { dedupeAttachedRoots } from "../../../shared/attached-roots.js";
import { extractExternalMentionPaths, type ComposerSegment } from "./composer-draft.js";

function normalizeGrantPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function attachedRootsChanged(previous: AttachedRoot[], next: AttachedRoot[]): boolean {
  if (previous.length !== next.length) return true;
  const previousKeys = new Set(previous.map((root) => normalizeGrantPath(root.absolutePath)));
  return next.some((root) => !previousKeys.has(normalizeGrantPath(root.absolutePath)));
}

export async function rootsForMissingMentionPaths(options: {
  segments: ComposerSegment[];
  attachedRoots: AttachedRoot[];
  attachedRootsFromPaths: (paths: string[]) => Promise<AttachedRoot[]>;
}): Promise<AttachedRoot[]> {
  const mentionPaths = extractExternalMentionPaths(options.segments);
  if (mentionPaths.length === 0) {
    return options.attachedRoots;
  }

  const existing = new Set(
    options.attachedRoots.map((root) => normalizeGrantPath(root.absolutePath)),
  );
  const missing = mentionPaths.filter((path) => !existing.has(normalizeGrantPath(path)));
  if (missing.length === 0) {
    return options.attachedRoots;
  }

  const resolved = await options.attachedRootsFromPaths(missing);
  return dedupeAttachedRoots([...options.attachedRoots, ...resolved]);
}
