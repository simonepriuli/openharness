import type { TimelineItem } from "../events";

/** Collect unique file paths touched by edit/write tools in a conversation timeline. */
export function collectEditedFilePaths(items: TimelineItem[] | undefined): string[] {
  if (!items?.length) return [];

  const paths = new Set<string>();
  for (const item of items) {
    if (item.kind === "tool-line" && (item.operation === "edit" || item.operation === "write")) {
      const path = item.gitPath ?? item.path;
      if (path) paths.add(path);
      continue;
    }

    if (item.kind === "tool-activity") {
      for (const edit of item.fileEdits ?? []) {
        if (edit.path) paths.add(edit.path);
      }
    }
  }

  return [...paths];
}
