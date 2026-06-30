import { $isCodeNode } from "@lexical/code";
import { $isQuoteNode } from "@lexical/rich-text";
import { $isTableNode } from "@lexical/table";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  type ElementNode,
  type LexicalNode,
} from "lexical";

export function $isEscapableBlock(node: LexicalNode): node is ElementNode {
  return $isCodeNode(node) || $isQuoteNode(node) || $isTableNode(node);
}

/** Root-level block containing the current selection, if any. */
export function $findRootBlockFromSelection(): ElementNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;

  let node: LexicalNode | null = selection.anchor.getNode();
  while (node) {
    if (node.getParent() === $getRoot() && $isElementNode(node)) {
      return node;
    }
    node = node.getParent();
  }
  return null;
}

/** Inserts an empty paragraph after `block` when the next sibling is not already one. */
export function $ensureParagraphAfterBlock(block: ElementNode): void {
  const next = block.getNextSibling();
  if ($isParagraphNode(next)) return;
  block.insertAfter($createParagraphNode());
}

/** Lets users click below the last code/quote/table when it ends the document. */
export function $ensureDocumentEndsWithExitParagraph(): void {
  const last = $getRoot().getLastChild();
  if (!last || !$isElementNode(last) || !$isEscapableBlock(last)) return;
  $ensureParagraphAfterBlock(last);
}
