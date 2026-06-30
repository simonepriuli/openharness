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
import { $createMentionNode } from "./MentionNode";
import { FileMentionMenu, type ProjectFile } from "../FileMentionMenu";
import { useComposerMenuPortal } from "./ComposerMenuPortalContext";

class MentionMenuOption extends MenuOption {
  file: ProjectFile;

  constructor(file: ProjectFile) {
    super(file.relativePath);
    this.file = file;
  }
}

export type MentionTypeaheadPluginProps = {
  enabled?: boolean;
  suppressed?: boolean;
  sessionKey?: string | null;
  onOpenChange?: (open: boolean) => void;
};

export function MentionTypeaheadPlugin({
  enabled = true,
  suppressed = false,
  sessionKey = null,
  onOpenChange,
}: MentionTypeaheadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const menuPortalRef = useComposerMenuPortal();
  const [query, setQuery] = useState<string | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(false);

  const triggerFn = useBasicTypeaheadTriggerMatch("@", {
    minLength: 0,
    maxLength: 75,
    punctuation: "\\.,\\+\\*\\?\\$\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%'\"~=<>_:;",
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
    if (!active) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.harness
        .searchFiles({ query: query ?? "", sessionKey: sessionKey ?? undefined })
        .then((result) => {
          if (!cancelled) setFiles(result.files);
        })
        .catch((err) => {
          console.error("[mention-typeahead] search failed:", err);
          if (!cancelled) setFiles([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, query, sessionKey]);

  const options = useMemo(() => files.map((file) => new MentionMenuOption(file)), [files]);

  const onSelectOption = useCallback(
    (
      option: MentionMenuOption,
      textNodeContainingQuery: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        const file = option.file;
        const mentionPath = file.absolutePath ?? file.relativePath;

        if (textNodeContainingQuery) {
          const mentionNode = $createMentionNode({
            segmentId: nextSegmentId(),
            relativePath: mentionPath,
            absolutePath: file.absolutePath,
            rootLabel: file.rootLabel,
          });
          textNodeContainingQuery.replace(mentionNode);
          const selection = $getSelection();
          if ($isRangeSelection(selection)) {
            selection.insertText(" ");
          }
        }

        closeMenu();
      });
    },
    [editor],
  );

  const menuRenderFn: MenuRenderFn<MentionMenuOption> = useCallback(
    (anchorElementRef, { selectOptionAndCleanUp, selectedIndex }) => {
      const portalTarget = menuPortalRef?.current ?? anchorElementRef.current;
      if (!portalTarget) return null;

      return createPortal(
        <FileMentionMenu
          files={files}
          selectedIndex={selectedIndex ?? 0}
          loading={loading}
          onSelect={(file) => {
            const option = options.find((entry) => entry.file.relativePath === file.relativePath);
            if (option) selectOptionAndCleanUp(option);
          }}
        />,
        portalTarget,
      );
    },
    [files, loading, menuPortalRef, options],
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
      commandPriority={2}
    />
  );
}
