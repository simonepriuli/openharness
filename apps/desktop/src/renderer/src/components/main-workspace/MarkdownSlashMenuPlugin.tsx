import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
  type MenuRenderFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createCodeNode } from "@lexical/code";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { INSERT_TABLE_COMMAND } from "@lexical/table";
import { $setBlocksType } from "@lexical/selection";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
  type TextNode,
} from "lexical";
import { MarkdownSlashMenu } from "./MarkdownSlashMenu";
import {
  filterMarkdownSlashCommands,
  MARKDOWN_SLASH_COMMANDS,
  type MarkdownSlashCommand,
} from "./markdown-slash-commands";

class SlashMenuOption extends MenuOption {
  command: MarkdownSlashCommand;

  constructor(command: MarkdownSlashCommand) {
    super(command.id);
    this.command = command;
  }
}

function removeSlashTrigger(textNode: TextNode, matchingString: string): void {
  const text = textNode.getTextContent();
  const trigger = `/${matchingString}`;
  const slashIndex = text.lastIndexOf("/");
  if (slashIndex === -1) {
    textNode.remove();
    return;
  }

  const before = text.slice(0, slashIndex);
  const after = text.slice(slashIndex + trigger.length);
  const nextText = `${before}${after}`;
  if (nextText) {
    textNode.setTextContent(nextText);
  } else {
    textNode.remove();
  }
}

function applySlashCommand(
  command: MarkdownSlashCommand,
  matchingString: string,
  textNodeContainingQuery: TextNode | null,
): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  if (textNodeContainingQuery) {
    removeSlashTrigger(textNodeContainingQuery, matchingString);
  }

  switch (command.id) {
    case "text":
      $setBlocksType(selection, () => $createParagraphNode());
      break;
    case "heading1":
      $setBlocksType(selection, () => $createHeadingNode("h1"));
      break;
    case "heading2":
      $setBlocksType(selection, () => $createHeadingNode("h2"));
      break;
    case "heading3":
      $setBlocksType(selection, () => $createHeadingNode("h3"));
      break;
    case "heading4":
      $setBlocksType(selection, () => $createHeadingNode("h4"));
      break;
    case "code-block":
      $setBlocksType(selection, () => $createCodeNode());
      break;
    case "quote":
      $setBlocksType(selection, () => $createQuoteNode());
      break;
    case "bullet-list":
    case "numbered-list":
    case "todo-list":
    case "table":
    case "divider":
    case "link":
      break;
  }
}

const SLASH_MENU_EDGE_MARGIN = 12;

function useClampSlashMenuToEditor(
  menuRef: RefObject<HTMLElement | null>,
  editor: LexicalEditor,
) {
  useLayoutEffect(() => {
    const menuElement = menuRef.current;
    const rootElement = editor.getRootElement();
    if (!menuElement || !rootElement) return;

    // Lexical positions this anchor element at the caret; we offset within it.
    const anchorElement = menuElement.parentElement;
    const scrollParent =
      rootElement.closest<HTMLElement>(".work-mode-markdown-editor") ?? rootElement;

    const clamp = () => {
      // Reset offset before measuring so the computation is idempotent.
      menuElement.style.transform = "";

      const bounds = rootElement.getBoundingClientRect();
      const maxWidth = Math.max(180, bounds.width - SLASH_MENU_EDGE_MARGIN * 2);
      menuElement.style.maxWidth = `${maxWidth}px`;

      const menuRect = menuElement.getBoundingClientRect();
      let shiftX = 0;
      let shiftY = 0;

      if (menuRect.right > bounds.right - SLASH_MENU_EDGE_MARGIN) {
        shiftX = bounds.right - SLASH_MENU_EDGE_MARGIN - menuRect.right;
      }
      if (menuRect.left + shiftX < bounds.left + SLASH_MENU_EDGE_MARGIN) {
        shiftX = bounds.left + SLASH_MENU_EDGE_MARGIN - menuRect.left;
      }
      if (menuRect.bottom > bounds.bottom - SLASH_MENU_EDGE_MARGIN) {
        shiftY = bounds.bottom - SLASH_MENU_EDGE_MARGIN - menuRect.bottom;
      }
      if (menuRect.top + shiftY < bounds.top + SLASH_MENU_EDGE_MARGIN) {
        shiftY = bounds.top + SLASH_MENU_EDGE_MARGIN - menuRect.top;
      }

      menuElement.style.transform =
        shiftX !== 0 || shiftY !== 0 ? `translate(${shiftX}px, ${shiftY}px)` : "";
    };

    // Lexical sets the anchor position in its own layout effect (after ours),
    // so defer the first clamp and re-run whenever the anchor moves.
    let frame = requestAnimationFrame(clamp);
    const scheduleClamp = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(clamp);
    };

    const sizeObserver = new ResizeObserver(scheduleClamp);
    sizeObserver.observe(menuElement);
    sizeObserver.observe(rootElement);

    let anchorObserver: MutationObserver | undefined;
    if (anchorElement) {
      anchorObserver = new MutationObserver(scheduleClamp);
      anchorObserver.observe(anchorElement, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }

    scrollParent.addEventListener("scroll", scheduleClamp, { passive: true });
    window.addEventListener("resize", scheduleClamp);

    return () => {
      cancelAnimationFrame(frame);
      sizeObserver.disconnect();
      anchorObserver?.disconnect();
      scrollParent.removeEventListener("scroll", scheduleClamp);
      window.removeEventListener("resize", scheduleClamp);
      menuElement.style.transform = "";
      menuElement.style.maxWidth = "";
    };
  }, [editor, menuRef]);
}

function PortaledSlashMenu({
  query,
  selectedIndex,
  onHighlightIndex,
  onSelectOption,
}: {
  query: string;
  selectedIndex: number | null;
  onHighlightIndex: (index: number) => void;
  onSelectOption: (command: MarkdownSlashCommand) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);

  useClampSlashMenuToEditor(menuRef, editor);

  return (
    <div ref={menuRef} className="work-mode-markdown-slash-anchor">
      <MarkdownSlashMenu
        query={query}
        selectedIndex={selectedIndex}
        onHighlightIndex={onHighlightIndex}
        onSelect={onSelectOption}
      />
    </div>
  );
}

export function MarkdownSlashMenuPlugin() {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);

  const triggerFn = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
    maxLength: 40,
    punctuation: "\\.,\\+\\*\\?\\$\\|#{}\\(\\)\\^\\-\\[\\]\\\\!%'\"~=<>_:;",
  });

  const filteredCommands = useMemo(
    () => filterMarkdownSlashCommands(MARKDOWN_SLASH_COMMANDS, query ?? ""),
    [query],
  );

  const options = useMemo(
    () => filteredCommands.map((command) => new SlashMenuOption(command)),
    [filteredCommands],
  );

  const onSelectOption = useCallback(
    (
      option: SlashMenuOption,
      textNodeContainingQuery: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      const command = option.command;

      if (command.id === "link") {
        const url = window.prompt("Link URL");
        if (!url) {
          closeMenu();
          return;
        }
        editor.update(() => {
          if (textNodeContainingQuery) {
            removeSlashTrigger(textNodeContainingQuery, matchingString);
          }
        });
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
        closeMenu();
        return;
      }

      editor.update(() => {
        applySlashCommand(command, matchingString, textNodeContainingQuery);

        if (command.id === "bullet-list") {
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        } else if (command.id === "numbered-list") {
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        } else if (command.id === "todo-list") {
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        } else if (command.id === "table") {
          editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns: "3",
            rows: "3",
            includeHeaders: true,
          });
        } else if (command.id === "divider") {
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined);
        }
      });

      closeMenu();
    },
    [editor],
  );

  const menuRenderFn: MenuRenderFn<SlashMenuOption> = useCallback(
    (anchorElementRef, { selectOptionAndCleanUp, selectedIndex, setHighlightedIndex }) => {
      if (!anchorElementRef.current) return null;

      return createPortal(
        <PortaledSlashMenu
          query={query ?? ""}
          selectedIndex={selectedIndex}
          onHighlightIndex={setHighlightedIndex}
          onSelectOption={(command) => {
            const option = options.find((entry) => entry.command.id === command.id);
            if (option) selectOptionAndCleanUp(option);
          }}
        />,
        anchorElementRef.current,
      );
    },
    [options, query],
  );

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={triggerFn}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      onClose={() => setQuery(null)}
      menuRenderFn={menuRenderFn}
      anchorClassName="work-mode-markdown-typeahead-anchor"
      preselectFirstItem
      commandPriority={COMMAND_PRIORITY_HIGH}
    />
  );
}
