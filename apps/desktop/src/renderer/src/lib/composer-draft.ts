import {
  formatToolToken,
  getSlashAtCursor,
  parseMessageParts,
  slashMenuItemToInvocation,
  toolLabelFromId,
  toolSectionFromId,
  type SlashMenuItem,
  type SlashRange,
  type ToolInvocation,
  type ToolSection,
} from "../../../shared/thread-tools";
import { formatFileMention, getMentionAtCursor, type MentionRange } from "./file-mention";

export interface TextSegment {
  type: "text";
  value: string;
}

export interface MentionSegment {
  type: "mention";
  id: string;
  relativePath: string;
}

export interface ImageSegment {
  type: "image";
  id: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}

export interface ToolSegment {
  type: "tool";
  id: string;
  toolId: string;
  label: string;
  section: ToolSection;
  filePath?: string;
  baseDir?: string;
}

export interface DraftImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export type ComposerSegment = TextSegment | MentionSegment | ImageSegment | ToolSegment;

export const MAX_DRAFT_IMAGES = 5;

let segmentIdCounter = 0;

export function nextSegmentId(): string {
  segmentIdCounter += 1;
  return `seg-${segmentIdCounter}`;
}

export function createEmptyDraft(): ComposerSegment[] {
  return [{ type: "text", value: "" }];
}

export function draftFromInstructions(text: string): ComposerSegment[] {
  if (!text.trim()) return createEmptyDraft();

  const segments: ComposerSegment[] = [];
  for (const part of parseMessageParts(text)) {
    if (part.type === "text") {
      if (part.value) segments.push({ type: "text", value: part.value });
      continue;
    }
    if (part.type === "tool") {
      segments.push({
        type: "tool",
        id: nextSegmentId(),
        toolId: part.toolId,
        label: part.label,
        section: part.section,
      });
      continue;
    }
    segments.push({
      type: "mention",
      id: nextSegmentId(),
      relativePath: part.relativePath,
    });
  }

  return ensureTrailingText(segments);
}

export function cloneDraft(segments: ComposerSegment[]): ComposerSegment[] {
  return segments.map((segment) => {
    if (segment.type === "text") {
      return { type: "text", value: segment.value };
    }
    if (segment.type === "mention") {
      return { type: "mention", id: segment.id, relativePath: segment.relativePath };
    }
    if (segment.type === "tool") {
      return {
        type: "tool",
        id: segment.id,
        toolId: segment.toolId,
        label: segment.label,
        section: segment.section,
        ...(segment.filePath ? { filePath: segment.filePath } : {}),
        ...(segment.baseDir ? { baseDir: segment.baseDir } : {}),
      };
    }
    return {
      type: "image",
      id: segment.id,
      mimeType: segment.mimeType,
      data: segment.data,
      previewUrl: segment.previewUrl,
    };
  });
}

export function getTrailingTextSegment(segments: ComposerSegment[]): TextSegment {
  const last = segments[segments.length - 1];
  if (last?.type === "text") return last;
  return { type: "text", value: "" };
}

export function ensureTrailingText(segments: ComposerSegment[]): ComposerSegment[] {
  const last = segments[segments.length - 1];
  if (last?.type === "text") return segments;
  return [...segments, { type: "text", value: "" }];
}

export function serializeDraft(segments: ComposerSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.type === "text") return segment.value;
      if (segment.type === "image") return "";
      if (segment.type === "tool") return `${formatToolToken(segment.toolId)} `;
      return `${formatFileMention(segment.relativePath)} `;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function getMentionInDraft(
  segments: ComposerSegment[],
  cursor: number,
): MentionRange | null {
  const text = getTrailingTextSegment(segments).value;
  const mention = getMentionAtCursor(text, cursor);
  if (!mention) return null;
  return mention;
}

export function getSlashInDraft(segments: ComposerSegment[], cursor: number): SlashRange | null {
  const text = getTrailingTextSegment(segments).value;
  return getSlashAtCursor(text, cursor);
}

export function insertToolInDraft(
  segments: ComposerSegment[],
  slash: SlashRange,
  item: SlashMenuItem,
): { segments: ComposerSegment[]; cursor: number } {
  const normalized = ensureTrailingText(segments);
  const lastIndex = normalized.length - 1;
  const textSeg = normalized[lastIndex] as TextSegment;
  const before = textSeg.value.slice(0, slash.start);
  const after = textSeg.value.slice(slash.end);

  const next: ComposerSegment[] = [
    ...normalized.slice(0, lastIndex),
    ...(before ? [{ type: "text" as const, value: before }] : []),
    {
      type: "tool",
      id: nextSegmentId(),
      toolId: item.toolId,
      label: item.label,
      section: item.section,
      ...(item.filePath ? { filePath: item.filePath } : {}),
      ...(item.baseDir ? { baseDir: item.baseDir } : {}),
    },
    { type: "text", value: after },
  ];

  const cursor = after.length;
  return { segments: next, cursor };
}

export function removeToolBeforeTrailing(segments: ComposerSegment[]): ComposerSegment[] {
  if (segments.length < 2) return segments;
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  if (last?.type !== "text" || prev?.type !== "tool") return segments;

  const merged = [...segments.slice(0, -2), { type: "text" as const, value: last.value }];
  return ensureTrailingText(merged);
}

export function extractToolsFromDraft(segments: ComposerSegment[]): ToolInvocation[] {
  return segments
    .filter((segment): segment is ToolSegment => segment.type === "tool")
    .map((segment) =>
      slashMenuItemToInvocation({
        toolId: segment.toolId,
        label: segment.label,
        description: "",
        section: segment.section,
        ...(segment.filePath ? { filePath: segment.filePath } : {}),
        ...(segment.baseDir ? { baseDir: segment.baseDir } : {}),
      }),
    );
}

export function createToolSegmentFromMenuItem(item: SlashMenuItem): ToolSegment {
  return {
    type: "tool",
    id: nextSegmentId(),
    toolId: item.toolId,
    label: item.label,
    section: item.section,
    ...(item.filePath ? { filePath: item.filePath } : {}),
    ...(item.baseDir ? { baseDir: item.baseDir } : {}),
  };
}

export { toolLabelFromId, toolSectionFromId };

export function insertMentionInDraft(
  segments: ComposerSegment[],
  mention: MentionRange,
  relativePath: string,
): { segments: ComposerSegment[]; cursor: number } {
  const normalized = ensureTrailingText(segments);
  const lastIndex = normalized.length - 1;
  const textSeg = normalized[lastIndex] as TextSegment;
  const before = textSeg.value.slice(0, mention.start);
  const after = textSeg.value.slice(mention.end);

  const next: ComposerSegment[] = [
    ...normalized.slice(0, lastIndex),
    ...(before ? [{ type: "text" as const, value: before }] : []),
    { type: "mention", id: nextSegmentId(), relativePath },
    { type: "text", value: after },
  ];

  const trailing = after;
  const cursor = trailing.length;
  return { segments: next, cursor };
}

export function updateTrailingText(
  segments: ComposerSegment[],
  value: string,
): ComposerSegment[] {
  const normalized = ensureTrailingText(segments);
  const lastIndex = normalized.length - 1;
  return [
    ...normalized.slice(0, lastIndex),
    { type: "text", value },
  ];
}

export function removeMentionBeforeTrailing(segments: ComposerSegment[]): ComposerSegment[] {
  if (segments.length < 2) return segments;
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  if (last?.type !== "text" || prev?.type !== "mention") return segments;

  const merged = [...segments.slice(0, -2), { type: "text" as const, value: last.value }];
  return ensureTrailingText(merged);
}

export function countImageSegments(segments: ComposerSegment[]): number {
  return segments.filter((segment) => segment.type === "image").length;
}

export function insertImageInDraft(
  segments: ComposerSegment[],
  image: Omit<ImageSegment, "id" | "type">,
): ComposerSegment[] {
  if (countImageSegments(segments) >= MAX_DRAFT_IMAGES) return segments;

  const normalized = ensureTrailingText(segments);
  const lastIndex = normalized.length - 1;
  return [
    ...normalized.slice(0, lastIndex),
    {
      type: "image",
      id: nextSegmentId(),
      mimeType: image.mimeType,
      data: image.data,
      previewUrl: image.previewUrl,
    },
    normalized[lastIndex]!,
  ];
}

export function removeImageBeforeTrailing(segments: ComposerSegment[]): ComposerSegment[] {
  if (segments.length < 2) return segments;
  const last = segments[segments.length - 1];
  const prev = segments[segments.length - 2];
  if (last?.type !== "text" || prev?.type !== "image") return segments;

  URL.revokeObjectURL(prev.previewUrl);
  const merged = [...segments.slice(0, -2), { type: "text" as const, value: last.value }];
  return ensureTrailingText(merged);
}

export function removeImageSegment(segments: ComposerSegment[], imageId: string): ComposerSegment[] {
  const next = segments.filter((segment) => {
    if (segment.type === "image" && segment.id === imageId) {
      URL.revokeObjectURL(segment.previewUrl);
      return false;
    }
    return true;
  });
  return ensureTrailingText(next);
}

export function extractImagesFromDraft(segments: ComposerSegment[]): DraftImageContent[] {
  return segments
    .filter((segment): segment is ImageSegment => segment.type === "image")
    .map((segment) => ({
      type: "image",
      data: segment.data,
      mimeType: segment.mimeType,
    }));
}

export function hasDraftContent(segments: ComposerSegment[]): boolean {
  return (
    serializeDraft(segments).length > 0 ||
    countImageSegments(segments) > 0 ||
    segments.some((segment) => segment.type === "tool")
  );
}

export function revokeDraftPreviewUrls(segments: ComposerSegment[]): void {
  for (const segment of segments) {
    if (segment.type === "image") {
      URL.revokeObjectURL(segment.previewUrl);
    }
  }
}

export function getFileBaseName(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/);
  return parts[parts.length - 1] ?? relativePath;
}

export function getFileIconMeta(relativePath: string): { label: string; color: string; textColor?: string } {
  const base = getFileBaseName(relativePath);
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() : "";

  switch (ext) {
    case "ts":
    case "tsx":
      return { label: "TS", color: "#3178c6" };
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return { label: "JS", color: "#f7df1e", textColor: "#713f12" };
    case "json":
      return { label: "{}", color: "#71717a" };
    case "md":
    case "mdx":
      return { label: "MD", color: "#71717a" };
    case "css":
      return { label: "CSS", color: "#2563eb" };
    case "html":
      return { label: "HTML", color: "#ea580c" };
    case "py":
      return { label: "PY", color: "#3776ab" };
    case "rs":
      return { label: "RS", color: "#dea584", textColor: "#7c2d12" };
    case "go":
      return { label: "GO", color: "#00add8" };
    default:
      return { label: ext?.slice(0, 3).toUpperCase() || "FILE", color: "#a1a1aa" };
  }
}
