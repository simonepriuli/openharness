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

export type ComposerSegment = TextSegment | MentionSegment;

let segmentIdCounter = 0;

export function nextSegmentId(): string {
  segmentIdCounter += 1;
  return `seg-${segmentIdCounter}`;
}

export function createEmptyDraft(): ComposerSegment[] {
  return [{ type: "text", value: "" }];
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
    .map((segment) =>
      segment.type === "text" ? segment.value : `${formatFileMention(segment.relativePath)} `,
    )
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
