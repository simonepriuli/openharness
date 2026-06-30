import {
  BOLD_STAR,
  CHECK_LIST,
  CODE,
  HEADING,
  INLINE_CODE,
  ITALIC_STAR,
  LINK,
  ORDERED_LIST,
  TRANSFORMERS,
  UNORDERED_LIST,
  type ElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from "@lexical/react/LexicalHorizontalRuleNode";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { createMarkdownTableTransformer } from "./markdown-table-transformer";

/** Markdown thematic break (`---`) <-> horizontal rule node. Not provided by core. */
const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }
    line.selectNext();
  },
  type: "element",
};

/** Block-level transformers used inside table cells (no nested tables). */
const WORK_MODE_MARKDOWN_CELL_TRANSFORMERS: Transformer[] = [
  HEADING,
  UNORDERED_LIST,
  ORDERED_LIST,
  CHECK_LIST,
  HORIZONTAL_RULE,
  LINK,
  BOLD_STAR,
  ITALIC_STAR,
  INLINE_CODE,
  CODE,
];

export const WORK_MODE_MARKDOWN_TABLE_TRANSFORMER = createMarkdownTableTransformer(
  WORK_MODE_MARKDOWN_CELL_TRANSFORMERS,
  () => WORK_MODE_MARKDOWN_TRANSFORMERS,
);

/** Common markdown subset supported in work-mode WYSIWYG. */
export const WORK_MODE_MARKDOWN_TRANSFORMERS: Transformer[] = [
  WORK_MODE_MARKDOWN_TABLE_TRANSFORMER,
  ...WORK_MODE_MARKDOWN_CELL_TRANSFORMERS,
];

export function createWorkModeMarkdownEditorConfig(): InitialConfigType {
  return {
    namespace: "WorkModeMarkdownEditor",
    theme: {
      paragraph: "work-mode-markdown-paragraph",
      heading: {
        h1: "work-mode-markdown-h1",
        h2: "work-mode-markdown-h2",
        h3: "work-mode-markdown-h3",
        h4: "work-mode-markdown-h4",
      },
      list: {
        ul: "work-mode-markdown-ul",
        ol: "work-mode-markdown-ol",
        listitem: "work-mode-markdown-li",
        listitemChecked: "work-mode-markdown-li-checked",
        listitemUnchecked: "work-mode-markdown-li-unchecked",
      },
      link: "work-mode-markdown-link",
      text: {
        bold: "work-mode-markdown-bold",
        italic: "work-mode-markdown-italic",
        code: "work-mode-markdown-inline-code",
      },
      code: "work-mode-markdown-code-block",
      quote: "work-mode-markdown-quote",
      hr: "work-mode-markdown-hr",
      table: "work-mode-markdown-table",
      tableCell: "work-mode-markdown-table-cell",
      tableCellHeader: "work-mode-markdown-table-cell-header",
      tableRow: "work-mode-markdown-table-row",
      tableSelection: "work-mode-markdown-table-selection",
    },
    nodes: [
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      CodeNode,
      HorizontalRuleNode,
      TableNode,
      TableRowNode,
      TableCellNode,
    ],
    onError(error: Error) {
      console.error("[WorkModeMarkdownEditor]", error);
    },
  };
}

/** Full transformers for import when agent writes richer markdown. */
export const WORK_MODE_MARKDOWN_IMPORT_TRANSFORMERS: Transformer[] = [
  WORK_MODE_MARKDOWN_TABLE_TRANSFORMER,
  ...TRANSFORMERS,
  HORIZONTAL_RULE,
];
