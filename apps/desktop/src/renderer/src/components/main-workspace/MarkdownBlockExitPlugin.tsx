import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent } from "@lexical/utils";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ENTER_COMMAND,
  mergeRegister,
  type ElementNode,
  type LexicalNode,
  type RangeSelection,
} from "lexical";
import { useEffect } from "react";

function $caretAtEndOfNode(selection: RangeSelection, node: ElementNode): boolean {
  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  if (anchorNode === node) {
    return anchor.offset === node.getChildrenSize();
  }

  if (!$isTextNode(anchorNode) && !$isLineBreakNode(anchorNode)) {
    return false;
  }

  if ($isTextNode(anchorNode) && anchor.offset < anchorNode.getTextContentSize()) {
    return false;
  }

  let current: LexicalNode | null = anchorNode;
  while (current && current !== node) {
    if (current.getNextSibling() !== null) {
      return false;
    }
    current = current.getParent();
  }
  return current === node;
}

function $insertParagraphAfter(block: ElementNode): void {
  const next = block.getNextSibling();
  if ($isParagraphNode(next)) {
    next.selectStart();
    return;
  }
  const paragraph = $createParagraphNode();
  block.insertAfter(paragraph);
  paragraph.select();
}

function $codeBlockAtSelectionEnd(selection: RangeSelection): ElementNode | null {
  const codeNode = $findMatchingParent(selection.anchor.getNode(), $isCodeNode);
  if (
    !codeNode ||
    codeNode.getParent() !== $getRoot() ||
    codeNode.getNextSibling() !== null
  ) {
    return null;
  }
  return $caretAtEndOfNode(selection, codeNode) ? (codeNode as ElementNode) : null;
}

export function MarkdownBlockExitPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const exitCodeForward = (): boolean => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const codeNode = $codeBlockAtSelectionEnd(selection);
      if (!codeNode) return false;
      $insertParagraphAfter(codeNode);
      return true;
    };

    return mergeRegister(
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (event?.altKey || event?.metaKey || event?.shiftKey) return false;
          return exitCodeForward();
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        (event) => {
          if (event?.altKey || event?.metaKey || event?.shiftKey) return false;
          return exitCodeForward();
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.shiftKey) return false;

          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

          const codeNode = $codeBlockAtSelectionEnd(selection);
          if (!codeNode) return false;

          // Only exit when the final line is empty, so the first Enter still
          // adds a newline inside the block and the second one leaves it.
          const lastChild = codeNode.getLastChild();
          const onEmptyTail =
            $isLineBreakNode(lastChild) ||
            ($isTextNode(lastChild) && lastChild.getTextContent().trim() === "");
          if (!onEmptyTail) return false;

          if ($isLineBreakNode(lastChild) || $isTextNode(lastChild)) {
            lastChild.remove();
          }

          event?.preventDefault();
          $insertParagraphAfter(codeNode);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor]);

  return null;
}
