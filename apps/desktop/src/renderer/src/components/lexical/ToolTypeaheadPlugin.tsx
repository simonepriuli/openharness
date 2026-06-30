import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
  type MenuRenderFn,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, type TextNode } from "lexical";
import { nextSegmentId } from "../../lib/composer-draft";
import type { SlashMenuAction, SlashMenuItem } from "../../../../shared/thread-tools";
import {
  listSelectableSlashMenuItems,
} from "../../../../shared/thread-tools";
import { $createToolNode } from "./ToolNode";
import { ToolPickerMenu } from "../ToolPickerMenu";
import { useComposerMenuPortal } from "./ComposerMenuPortalContext";

class ToolMenuOption extends MenuOption {
  item: SlashMenuItem;

  constructor(item: SlashMenuItem) {
    super(item.toolId);
    this.item = item;
  }
}

export type ToolTypeaheadPluginProps = {
  loadItems: () => Promise<SlashMenuItem[]>;
  cachedSlashItems?: SlashMenuItem[];
  enabled?: boolean;
  suppressed?: boolean;
  onSelectTool?: (item: SlashMenuItem) => void;
  onSelectAttachAction?: (action: SlashMenuAction) => void;
  onOpenChange?: (open: boolean) => void;
};

export function ToolTypeaheadPlugin({
  loadItems,
  cachedSlashItems,
  enabled = true,
  suppressed = false,
  onSelectTool,
  onSelectAttachAction,
  onOpenChange,
}: ToolTypeaheadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const menuPortalRef = useComposerMenuPortal();
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<SlashMenuItem[]>(cachedSlashItems ?? []);
  const [loading, setLoading] = useState(false);

  const triggerFn = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
    maxLength: 75,
  });

  const active = enabled && !suppressed && query !== null;

  const handleOpen = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handleClose = useCallback(() => {
    setQuery(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (cachedSlashItems && cachedSlashItems.length > 0) {
      setItems(cachedSlashItems);
    }
  }, [cachedSlashItems]);

  useEffect(() => {
    if (!active) {
      setLoading(false);
      return;
    }

    if (cachedSlashItems && cachedSlashItems.length > 0) {
      setItems(cachedSlashItems);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.resolve()
      .then(() => loadItems())
      .then((loaded) => {
        if (!cancelled) setItems(loaded);
      })
      .catch((err) => {
        console.error("[tool-typeahead] load failed:", err);
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, cachedSlashItems, loadItems]);

  const selectableItems = useMemo(
    () => listSelectableSlashMenuItems(items, query ?? ""),
    [items, query],
  );

  const options = useMemo(
    () => selectableItems.map((item) => new ToolMenuOption(item)),
    [selectableItems],
  );

  const onSelectOption = useCallback(
    (
      option: ToolMenuOption,
      textNodeContainingQuery: TextNode | null,
      closeMenu: () => void,
      matchingString: string,
    ) => {
      editor.update(() => {
        const item = option.item;

        if (item.action) {
          onSelectAttachAction?.(item.action);
          if (textNodeContainingQuery) {
            const text = textNodeContainingQuery.getTextContent();
            const nextText = text.replace(`/${matchingString}`, "");
            if (nextText) {
              textNodeContainingQuery.setTextContent(nextText);
            } else {
              textNodeContainingQuery.remove();
            }
          }
          closeMenu();
          return;
        }

        if (textNodeContainingQuery) {
          const toolNode = $createToolNode({
            segmentId: nextSegmentId(),
            toolId: item.toolId,
            label: item.label,
            section: item.section,
            filePath: item.filePath,
            baseDir: item.baseDir,
          });
          textNodeContainingQuery.replace(toolNode);
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText(" ");
          }
        }

        onSelectTool?.(item);
        closeMenu();
      });
    },
    [editor, onSelectAttachAction, onSelectTool],
  );

  const menuRenderFn: MenuRenderFn<ToolMenuOption> = useCallback(
    (anchorElementRef, { selectOptionAndCleanUp, selectedIndex }) => {
      const portalTarget = menuPortalRef?.current ?? anchorElementRef.current;
      if (!portalTarget) return null;

      return createPortal(
        <ToolPickerMenu
          items={items}
          query={query ?? ""}
          selectedIndex={selectedIndex ?? 0}
          loading={loading}
          onSelect={(item) => {
            const option = options.find((entry) => entry.item.toolId === item.toolId);
            if (option) selectOptionAndCleanUp(option);
          }}
        />,
        portalTarget,
      );
    },
    [items, loading, menuPortalRef, options, query],
  );

  if (!enabled) return null;

  return (
    <LexicalTypeaheadMenuPlugin
      triggerFn={triggerFn}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      onOpen={handleOpen}
      onClose={handleClose}
      menuRenderFn={menuRenderFn}
      anchorClassName="composer-typeahead-anchor"
      commandPriority={1}
    />
  );
}
