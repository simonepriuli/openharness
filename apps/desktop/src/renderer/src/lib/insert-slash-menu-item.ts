import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  type LexicalEditor,
  type TextNode,
} from "lexical";
import type { SlashMenuItem } from "../../../shared/thread-tools";
import { $createToolNode } from "../components/lexical/ToolNode";
import { nextSegmentId } from "./composer-draft";

export function insertSlashMenuTool(
  editor: LexicalEditor,
  item: SlashMenuItem,
  options?: {
    textNodeContainingQuery?: TextNode | null;
    matchingString?: string;
  },
): void {
  editor.update(() => {
    const toolNode = $createToolNode({
      segmentId: nextSegmentId(),
      toolId: item.toolId,
      label: item.label,
      section: item.section,
      filePath: item.filePath,
      baseDir: item.baseDir,
    });

    const textNodeContainingQuery = options?.textNodeContainingQuery;
    if (textNodeContainingQuery) {
      textNodeContainingQuery.replace(toolNode);
    } else {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([toolNode]);
      } else {
        $getRoot().append(toolNode);
      }
    }

    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      selection.insertText(" ");
    }
  });
}

export function removeSlashQueryText(
  textNodeContainingQuery: TextNode,
  matchingString: string,
): void {
  const text = textNodeContainingQuery.getTextContent();
  const nextText = text.replace(`/${matchingString}`, "");
  if (nextText) {
    textNodeContainingQuery.setTextContent(nextText);
  } else {
    textNodeContainingQuery.remove();
  }
}
