import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  type LexicalEditor,
} from "lexical";
import {
  $createMentionNode,
  $isMentionNode,
} from "../components/lexical/MentionNode";
import {
  $createToolNode,
  $isToolNode,
} from "../components/lexical/ToolNode";
import type { ComposerSegment, MentionSegment, ToolSegment } from "./composer-draft";

function appendTextSegment(segments: ComposerSegment[], value: string): void {
  if (!value) return;
  const last = segments[segments.length - 1];
  if (last?.type === "text") {
    last.value += value;
    return;
  }
  segments.push({ type: "text", value });
}

function appendParagraphBreak(segments: ComposerSegment[]): void {
  const last = segments[segments.length - 1];
  if (last?.type === "text") {
    last.value += "\n";
    return;
  }
  segments.push({ type: "text", value: "\n" });
}

export function $populateEditorFromSegments(segments: ComposerSegment[]): void {
  const root = $getRoot();
  root.clear();

  const editorSegments = segments.filter((segment) => segment.type !== "image");
  if (editorSegments.length === 0) {
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode(""));
    root.append(paragraph);
    return;
  }

  let paragraph = $createParagraphNode();
  root.append(paragraph);

  for (const segment of editorSegments) {
    if (segment.type === "text") {
      const parts = segment.value.split("\n");
      for (let index = 0; index < parts.length; index += 1) {
        if (index > 0) {
          paragraph = $createParagraphNode();
          root.append(paragraph);
        }
        paragraph.append($createTextNode(parts[index] ?? ""));
      }
      continue;
    }

    if (segment.type === "tool") {
      paragraph.append(
        $createToolNode({
          segmentId: segment.id,
          toolId: segment.toolId,
          label: segment.label,
          section: segment.section,
          filePath: segment.filePath,
          baseDir: segment.baseDir,
        }),
      );
      continue;
    }

    if (segment.type === "mention") {
      paragraph.append(
        $createMentionNode({
          segmentId: segment.id,
          relativePath: segment.relativePath,
          absolutePath: segment.absolutePath,
          rootLabel: segment.rootLabel,
        }),
      );
    }
  }

  if (root.getChildrenSize() === 0) {
    const emptyParagraph = $createParagraphNode();
    emptyParagraph.append($createTextNode(""));
    root.append(emptyParagraph);
  }
}

export function $editorToSegments(): ComposerSegment[] {
  const segments: ComposerSegment[] = [];
  const root = $getRoot();
  const paragraphs = root.getChildren();

  paragraphs.forEach((child, paragraphIndex) => {
    if (!$isParagraphNode(child)) return;

    for (const node of child.getChildren()) {
      if ($isTextNode(node)) {
        appendTextSegment(segments, node.getTextContent());
        continue;
      }

      if ($isToolNode(node)) {
        const toolSegment: ToolSegment = {
          type: "tool",
          id: node.getSegmentId(),
          toolId: node.getToolId(),
          label: node.getLabel(),
          section: node.getSection(),
        };
        const filePath = node.getFilePath();
        const baseDir = node.getBaseDir();
        if (filePath) toolSegment.filePath = filePath;
        if (baseDir) toolSegment.baseDir = baseDir;
        segments.push(toolSegment);
        continue;
      }

      if ($isMentionNode(node)) {
        const mentionSegment: MentionSegment = {
          type: "mention",
          id: node.getSegmentId(),
          relativePath: node.getRelativePath(),
        };
        const absolutePath = node.getAbsolutePath();
        const rootLabel = node.getRootLabel();
        if (absolutePath) mentionSegment.absolutePath = absolutePath;
        if (rootLabel) mentionSegment.rootLabel = rootLabel;
        segments.push(mentionSegment);
      }
    }

    if (paragraphIndex < paragraphs.length - 1) {
      appendParagraphBreak(segments);
    }
  });

  if (segments.length === 0) {
    return [{ type: "text", value: "" }];
  }

  const last = segments[segments.length - 1];
  if (last?.type !== "text") {
    segments.push({ type: "text", value: "" });
  }

  return segments;
}

export function syncEditorFromSegments(editor: LexicalEditor, segments: ComposerSegment[]): void {
  editor.update(
    () => {
      $populateEditorFromSegments(segments);
    },
    { discrete: true },
  );
}

export function readEditorSegments(editor: LexicalEditor): ComposerSegment[] {
  let editorSegments: ComposerSegment[] = [{ type: "text", value: "" }];
  editor.getEditorState().read(() => {
    editorSegments = $editorToSegments();
  });
  return editorSegments;
}
