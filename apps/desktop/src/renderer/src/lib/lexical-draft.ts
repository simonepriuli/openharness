import type { ComposerSegment, ImageSegment } from "./composer-draft";

export function filterEditorSegments(segments: ComposerSegment[]): ComposerSegment[] {
  return segments.filter((segment) => segment.type !== "image");
}

export function extractImageSegments(segments: ComposerSegment[]): ImageSegment[] {
  return segments.filter((segment): segment is ImageSegment => segment.type === "image");
}

export function mergeSegmentsWithImages(
  editorSegments: ComposerSegment[],
  imageSegments: ImageSegment[],
): ComposerSegment[] {
  if (imageSegments.length === 0) return editorSegments;
  return [...imageSegments, ...editorSegments];
}

export function editorSegmentsSignature(segments: ComposerSegment[]): string {
  return JSON.stringify(filterEditorSegments(segments));
}

export function hasEditorTextContent(segments: ComposerSegment[]): boolean {
  return filterEditorSegments(segments).some(
    (segment) => segment.type !== "text" || segment.value.length > 0,
  );
}

export function getTrailingEditorText(segments: ComposerSegment[]): string {
  const editorSegments = filterEditorSegments(segments);
  const last = editorSegments[editorSegments.length - 1];
  if (last?.type === "text") return last.value;
  return "";
}
