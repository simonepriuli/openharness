import type { AttachedRoot } from "../../../preload/api";
import { insertExternalMentionInDraft, type ComposerSegment } from "./composer-draft";
import { addImageFileToDraft, isSupportedDroppedImageFile } from "./image-attachment";

export async function processComposerDrop(options: {
  files: File[];
  segments: ComposerSegment[];
  getPathForFile: (file: File) => string;
  attachedRootsFromPaths: (paths: string[]) => Promise<AttachedRoot[]>;
}): Promise<{ segments: ComposerSegment[]; attachedRoots: AttachedRoot[] }> {
  let nextSegments = options.segments;
  const attachPaths: string[] = [];

  for (const file of options.files) {
    if (isSupportedDroppedImageFile(file)) {
      const withImage = await addImageFileToDraft(nextSegments, file);
      if (withImage) {
        nextSegments = withImage;
      }
      continue;
    }

    const absolutePath = options.getPathForFile(file).trim();
    if (!absolutePath) continue;
    attachPaths.push(absolutePath);
  }

  if (attachPaths.length === 0) {
    return { segments: nextSegments, attachedRoots: [] };
  }

  const attachedRoots = await options.attachedRootsFromPaths(attachPaths);
  for (const root of attachedRoots) {
    if (root.kind === "file") {
      nextSegments = insertExternalMentionInDraft(nextSegments, root.absolutePath);
    }
  }

  return { segments: nextSegments, attachedRoots };
}
