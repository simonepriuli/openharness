import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import type { SlashMenuAction, SlashMenuItem } from "../../../../shared/thread-tools";
import type { ComposerSegment, ToolSegment } from "../../lib/composer-draft";
import {
  editorSegmentsSignature,
  extractImageSegments,
  hasEditorTextContent,
  mergeSegmentsWithImages,
} from "../../lib/lexical-draft";
import {
  readEditorSegments,
  syncEditorFromSegments,
} from "../../lib/lexical-editor-state";
import { ComposerChipActionsContext } from "./ComposerChipActionsContext";
import { ComposerMenuPortalContext } from "./ComposerMenuPortalContext";
import { MentionNode } from "./MentionNode";
import { MentionTypeaheadPlugin } from "./MentionTypeaheadPlugin";
import { ToolNode } from "./ToolNode";
import { ToolTypeaheadPlugin } from "./ToolTypeaheadPlugin";

export type LexicalComposerInputProps = {
  segments: ComposerSegment[];
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  loadItems: () => Promise<SlashMenuItem[]>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  minRows?: number;
  maxHeight?: number;
  toolPickerEnabled?: boolean;
  mentionEnabled?: boolean;
  sessionKey?: string | null;
  cachedSlashItems?: SlashMenuItem[];
  editorRef?: RefObject<LexicalEditor | null>;
  onKeyDown?: (event: ReactKeyboardEvent) => void;
  onPaste?: (event: ReactClipboardEvent) => void;
  onSelectAttachAction?: (action: SlashMenuAction) => void;
  onSelectTool?: (item: SlashMenuItem) => void;
  onRemoveTool?: (segment: ToolSegment) => void;
  canEnterSend?: boolean;
  onEnterSend?: () => void;
  menuPortalRef?: RefObject<HTMLElement | null>;
};

function Placeholder({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="composer-input-placeholder">{text}</div>;
}

function SegmentSyncPlugin({
  segments,
  onSegmentsChange,
}: {
  segments: ComposerSegment[];
  onSegmentsChange: (segments: ComposerSegment[]) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const externalSignatureRef = useRef<string | undefined>(undefined);
  const emittedSignatureRef = useRef<string | undefined>(undefined);
  const initialSyncDoneRef = useRef(false);
  const imageSegmentsRef = useRef(extractImageSegments(segments));

  useEffect(() => {
    initialSyncDoneRef.current = false;
    externalSignatureRef.current = undefined;
    emittedSignatureRef.current = undefined;
  }, [editor]);

  useEffect(() => {
    imageSegmentsRef.current = extractImageSegments(segments);
  }, [segments]);

  useEffect(() => {
    const nextSignature = editorSegmentsSignature(segments);

    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
      syncEditorFromSegments(editor, segments);
      emittedSignatureRef.current = nextSignature;
      externalSignatureRef.current = nextSignature;
      return;
    }

    if (nextSignature === externalSignatureRef.current) return;

    externalSignatureRef.current = nextSignature;
    if (nextSignature === emittedSignatureRef.current) return;

    syncEditorFromSegments(editor, segments);
    emittedSignatureRef.current = nextSignature;
  }, [editor, segments]);

  const handleChange = useCallback(
    (_editorState: EditorState) => {
      if (!initialSyncDoneRef.current) return;

      const editorSegments = readEditorSegments(editor);
      const merged = mergeSegmentsWithImages(editorSegments, imageSegmentsRef.current);
      const nextSignature = editorSegmentsSignature(merged);
      if (nextSignature === emittedSignatureRef.current) return;

      emittedSignatureRef.current = nextSignature;
      externalSignatureRef.current = nextSignature;
      onSegmentsChange(merged);
    },
    [editor, onSegmentsChange],
  );

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />;
}

function EditorRefPlugin({ editorRef }: { editorRef?: RefObject<LexicalEditor | null> }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = editor;
    return () => {
      if (editorRef.current === editor) {
        editorRef.current = null;
      }
    };
  }, [editor, editorRef]);

  return null;
}

function EditableStatePlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
}

function ComposerInputPlugins({
  disabled,
  editorRef,
  loadItems,
  cachedSlashItems,
  toolPickerEnabled,
  mentionEnabled,
  sessionKey,
  onKeyDown,
  onPaste,
  onSelectAttachAction,
  onSelectTool,
  canEnterSend,
  onEnterSend,
}: Pick<
  LexicalComposerInputProps,
  | "disabled"
  | "editorRef"
  | "loadItems"
  | "cachedSlashItems"
  | "toolPickerEnabled"
  | "mentionEnabled"
  | "sessionKey"
  | "onKeyDown"
  | "onPaste"
  | "onSelectAttachAction"
  | "onSelectTool"
  | "canEnterSend"
  | "onEnterSend"
>) {
  const [editor] = useLexicalComposerContext();
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [mentionMenuOpen, setMentionMenuOpen] = useState(false);

  useEffect(() => {
    if (!onKeyDown) return;

    const rootElement = editor.getRootElement();
    if (!rootElement) return;

    const handler = (event: Event) => {
      const keyboardEvent = event as unknown as ReactKeyboardEvent;
      if (
        keyboardEvent.key === "Enter" &&
        !keyboardEvent.shiftKey &&
        (toolMenuOpen || mentionMenuOpen)
      ) {
        return;
      }
      onKeyDown(keyboardEvent);
    };

    rootElement.addEventListener("keydown", handler);
    return () => rootElement.removeEventListener("keydown", handler);
  }, [editor, mentionMenuOpen, onKeyDown, toolMenuOpen]);

  useEffect(() => {
    if (!onEnterSend) return;

    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event?.shiftKey) return false;
        if (toolMenuOpen || mentionMenuOpen) return false;
        event?.preventDefault();
        if (canEnterSend) onEnterSend();
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [canEnterSend, editor, mentionMenuOpen, onEnterSend, toolMenuOpen]);

  useEffect(() => {
    if (!onPaste) return;

    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        onPaste(event as unknown as ReactClipboardEvent);
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onPaste]);

  return (
    <>
      <EditorRefPlugin editorRef={editorRef} />
      <EditableStatePlugin disabled={disabled ?? false} />
      <HistoryPlugin />
      <ToolTypeaheadPlugin
        loadItems={loadItems}
        cachedSlashItems={cachedSlashItems}
        enabled={toolPickerEnabled}
        suppressed={mentionMenuOpen}
        onSelectAttachAction={onSelectAttachAction}
        onSelectTool={onSelectTool}
        onOpenChange={setToolMenuOpen}
      />
      <MentionTypeaheadPlugin
        enabled={mentionEnabled}
        sessionKey={sessionKey}
        suppressed={toolMenuOpen}
        onOpenChange={setMentionMenuOpen}
      />
    </>
  );
}

export function LexicalComposerInput({
  segments,
  onSegmentsChange,
  loadItems,
  placeholder,
  className,
  inputClassName,
  disabled = false,
  minRows = 1,
  maxHeight = 160,
  toolPickerEnabled = true,
  mentionEnabled = true,
  sessionKey = null,
  cachedSlashItems,
  editorRef,
  onKeyDown,
  onPaste,
  onSelectAttachAction,
  onSelectTool,
  onRemoveTool,
  canEnterSend,
  onEnterSend,
  menuPortalRef,
}: LexicalComposerInputProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: "openharness-composer",
      nodes: [ToolNode, MentionNode],
      onError(error: Error) {
        console.error("[lexical-composer]", error);
      },
      theme: {
        paragraph: "composer-lexical-paragraph",
      },
    }),
    [],
  );

  const showPlaceholder = placeholder && !hasEditorTextContent(segments);
  const lineHeight = 1.5;
  const fontSize = 15;
  const minHeight = minRows * fontSize * lineHeight;

  const editorStyle = {
    minHeight: `${minHeight}px`,
    maxHeight: maxHeight > 0 ? `${maxHeight}px` : undefined,
  } satisfies CSSProperties;

  const focusEditor = () => {
    if (disabled) return;
    editorRef?.current?.focus();
  };

  const chipActions = useMemo(
    () => ({ onRemoveTool }),
    [onRemoveTool],
  );

  return (
    <div className={className} onClick={focusEditor}>
      <ComposerChipActionsContext.Provider value={chipActions}>
        <ComposerMenuPortalContext.Provider value={menuPortalRef ?? null}>
          <LexicalComposer initialConfig={initialConfig}>
        <div className="composer-input-content composer-lexical-input-content">
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`composer-input composer-input-inline composer-lexical-input${
                  inputClassName ? ` ${inputClassName}` : ""
                }`}
                style={editorStyle}
                aria-placeholder={placeholder ?? ""}
                placeholder={() => null}
                spellCheck
              />
            }
            placeholder={<Placeholder text={showPlaceholder ? placeholder : undefined} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <ComposerInputPlugins
            disabled={disabled}
            editorRef={editorRef}
            loadItems={loadItems}
            cachedSlashItems={cachedSlashItems}
            toolPickerEnabled={toolPickerEnabled}
            mentionEnabled={mentionEnabled}
            sessionKey={sessionKey}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onSelectAttachAction={onSelectAttachAction}
            onSelectTool={onSelectTool}
            canEnterSend={canEnterSend}
            onEnterSend={onEnterSend}
          />
          <SegmentSyncPlugin segments={segments} onSegmentsChange={onSegmentsChange} />
        </div>
          </LexicalComposer>
        </ComposerMenuPortalContext.Provider>
      </ComposerChipActionsContext.Provider>
    </div>
  );
}
