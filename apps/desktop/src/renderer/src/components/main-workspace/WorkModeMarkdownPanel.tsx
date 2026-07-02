import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { $convertFromMarkdownString, $convertToMarkdownString } from "@lexical/markdown";
import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $addUpdateTag,
  $getRoot,
  SKIP_DOM_SELECTION_TAG,
  type EditorState,
} from "lexical";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { MarkdownSlashMenuPlugin } from "./MarkdownSlashMenuPlugin";
import { MarkdownTableActionsPlugin } from "./MarkdownTableActionsPlugin";
import { $ensureDocumentEndsWithExitParagraph } from "./markdown-trailing-paragraph";
import {
  createWorkModeMarkdownEditorConfig,
  WORK_MODE_MARKDOWN_IMPORT_TRANSFORMERS,
  WORK_MODE_MARKDOWN_TRANSFORMERS,
} from "./work-mode-markdown-config";

type WorkModeMarkdownPanelProps = {
  cwd: string | null;
  sessionKey?: string | null;
  activePath?: string;
  refreshKey?: number;
  onManualRefresh: () => void;
};

const AUTO_SAVE_MS = 500;
const EDIT_IDLE_MS = 2000;

function documentFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

function documentErrorMessage(error: string): string {
  switch (error) {
    case "too_large":
      return "This document is larger than 512 KB and cannot be edited in OpenHarness.";
    case "outside_project":
      return "Document path is outside the workspace.";
    case "binary":
      return "Only text markdown files can be edited here.";
    case "directory":
      return "The selected path is a directory, not a document.";
    case "not_found":
      return "Document not found.";
    default:
      return "Failed to load document.";
  }
}

function MarkdownLoadPlugin({
  markdown,
  loadVersion,
}: {
  markdown: string;
  loadVersion: number;
}) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.update(
      () => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG);
        const root = $getRoot();
        root.clear();
        $convertFromMarkdownString(
          markdown,
          WORK_MODE_MARKDOWN_IMPORT_TRANSFORMERS,
          undefined,
          false,
        );
        $ensureDocumentEndsWithExitParagraph();
      },
      { discrete: true },
    );
  }, [editor, loadVersion, markdown]);

  return null;
}

function MarkdownAutoSavePlugin({
  cwd,
  sessionKey,
  activePath,
  enabled,
  shouldSaveMarkdown,
  onCurrentMarkdownChange,
  onSaved,
  onSaving,
}: {
  cwd: string;
  sessionKey?: string | null;
  activePath: string;
  enabled: boolean;
  shouldSaveMarkdown: (markdown: string) => boolean;
  onCurrentMarkdownChange: (markdown: string) => void;
  onSaved: (mtimeMs: number, markdown: string) => void;
  onSaving: () => void;
}) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkdownRef = useRef<string | null>(null);
  const savingRef = useRef(false);

  const flushSave = useCallback(async () => {
    if (!enabled || savingRef.current) return;
    const markdown = pendingMarkdownRef.current;
    if (markdown == null || !shouldSaveMarkdown(markdown)) return;

    savingRef.current = true;
    onSaving();
    try {
      const result = await window.harness.writeProjectFile({
        cwd,
        relativePath: activePath,
        contents: markdown,
        sessionKey: sessionKey ?? undefined,
      });
      if (result.ok) {
        onSaved(result.mtimeMs, markdown);
      }
    } finally {
      savingRef.current = false;
    }
  }, [activePath, cwd, enabled, onSaved, onSaving, sessionKey, shouldSaveMarkdown]);

  const scheduleSave = useCallback(
    (markdown: string) => {
      pendingMarkdownRef.current = markdown;
      if (!enabled || !shouldSaveMarkdown(markdown)) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, AUTO_SAVE_MS);
    },
    [enabled, flushSave, shouldSaveMarkdown],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const markdown = editorState.read(() =>
        $convertToMarkdownString(WORK_MODE_MARKDOWN_TRANSFORMERS, undefined, false),
      );
      onCurrentMarkdownChange(markdown);
      scheduleSave(markdown);
    },
    [onCurrentMarkdownChange, scheduleSave],
  );

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />;
}

function MarkdownEditLockPlugin({
  sessionKey,
  activePath,
  editorContainerRef,
  isEditingRef,
}: {
  sessionKey?: string | null;
  activePath: string;
  editorContainerRef: React.RefObject<HTMLElement | null>;
  isEditingRef: React.MutableRefObject<boolean>;
}) {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedRef = useRef(false);

  const setLocked = useCallback(
    (locked: boolean) => {
      if (lockedRef.current === locked) return;
      lockedRef.current = locked;
      isEditingRef.current = locked;
      if (!sessionKey) return;
      void window.harness.setMarkdownEditLock({
        sessionKey,
        relativePath: activePath,
        locked,
      });
    },
    [activePath, isEditingRef, sessionKey],
  );

  const touchEditing = useCallback(() => {
    setLocked(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setLocked(false), EDIT_IDLE_MS);
  }, [setLocked]);

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const onFocusIn = () => touchEditing();
    const onKeyDown = () => touchEditing();
    const onFocusOut = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => setLocked(false), EDIT_IDLE_MS);
    };

    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("keydown", onKeyDown);
    container.addEventListener("focusout", onFocusOut);

    return () => {
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("keydown", onKeyDown);
      container.removeEventListener("focusout", onFocusOut);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      setLocked(false);
    };
  }, [activePath, editorContainerRef, sessionKey, setLocked, touchEditing]);

  return null;
}

const MarkdownEditorSurface = memo(function MarkdownEditorSurface({
  cwd,
  sessionKey,
  activePath,
  enabled,
  markdown,
  loadVersion,
  editorConfig,
  editorContainerRef,
  isEditingRef,
  shouldSaveMarkdown,
  onCurrentMarkdownChange,
  onSaving,
  onSaved,
}: {
  cwd: string;
  sessionKey?: string | null;
  activePath: string;
  enabled: boolean;
  markdown: string;
  loadVersion: number;
  editorConfig: InitialConfigType;
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
  isEditingRef: React.MutableRefObject<boolean>;
  shouldSaveMarkdown: (markdown: string) => boolean;
  onCurrentMarkdownChange: (markdown: string) => void;
  onSaving: () => void;
  onSaved: (mtimeMs: number, markdown: string) => void;
}) {
  return (
    <LexicalComposer initialConfig={editorConfig}>
      <div className="work-mode-markdown-editor scroll-viewport">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="work-mode-markdown-content-editable"
              aria-label="Markdown document editor"
            />
          }
          placeholder={
            <div className="work-mode-markdown-placeholder">
              Start writing, or type <kbd>/</kbd> for blocks…
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <CheckListPlugin />
        <LinkPlugin />
        <HorizontalRulePlugin />
        <TablePlugin hasCellMerge hasHorizontalScroll />
        <MarkdownLoadPlugin markdown={markdown} loadVersion={loadVersion} />
        <MarkdownAutoSavePlugin
          cwd={cwd}
          sessionKey={sessionKey}
          activePath={activePath}
          enabled={enabled}
          shouldSaveMarkdown={shouldSaveMarkdown}
          onCurrentMarkdownChange={onCurrentMarkdownChange}
          onSaving={onSaving}
          onSaved={onSaved}
        />
        <MarkdownEditLockPlugin
          sessionKey={sessionKey}
          activePath={activePath}
          editorContainerRef={editorContainerRef}
          isEditingRef={isEditingRef}
        />
        <MarkdownSlashMenuPlugin />
        <MarkdownTableActionsPlugin />
      </div>
    </LexicalComposer>
  );
});

export function WorkModeMarkdownPanel({
  cwd,
  sessionKey,
  activePath,
  refreshKey = 0,
}: WorkModeMarkdownPanelProps) {
  const [markdown, setMarkdown] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const isEditingRef = useRef(false);
  const currentMarkdownRef = useRef("");
  const persistedMarkdownRef = useRef("");
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const editorConfig = useRef(createWorkModeMarkdownEditorConfig()).current;

  const loadDocument = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? true;
    if (!cwd || !activePath) {
      setMarkdown("");
      currentMarkdownRef.current = "";
      persistedMarkdownRef.current = "";
      setError(null);
      setLoading(false);
      return;
    }

    if (showLoading) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await window.harness.readProjectFile({
        cwd,
        relativePath: activePath,
        sessionKey: sessionKey ?? undefined,
      });
      if (!result.ok) {
        if (showLoading) {
          setMarkdown("");
          currentMarkdownRef.current = "";
          persistedMarkdownRef.current = "";
          setError(documentErrorMessage(result.error));
        }
        return;
      }
      if (!showLoading && result.contents === currentMarkdownRef.current) return;
      if (!showLoading && isEditingRef.current) return;

      currentMarkdownRef.current = result.contents;
      persistedMarkdownRef.current = result.contents;
      setMarkdown(result.contents);
      setLoadVersion((value) => value + 1);
      if (showLoading) setError(null);
    } catch (err) {
      if (showLoading) {
        setMarkdown("");
        currentMarkdownRef.current = "";
        persistedMarkdownRef.current = "";
        setError(err instanceof Error ? err.message : "Failed to load document.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [activePath, cwd, sessionKey]);

  useEffect(() => {
    void loadDocument({ showLoading: true });
  }, [activePath, cwd, loadDocument, sessionKey]);

  const prevRefreshKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (prevRefreshKeyRef.current === refreshKey) return;
    prevRefreshKeyRef.current = refreshKey;
    void loadDocument({ showLoading: false });
  }, [loadDocument, refreshKey]);

  useEffect(() => {
    if (!cwd || !activePath) {
      void window.harness.unwatchOfficeFile();
      return;
    }
    void window.harness.watchOfficeFile({
      cwd,
      relativePath: activePath,
      sessionKey: sessionKey ?? undefined,
    });
    return () => {
      void window.harness.unwatchOfficeFile();
    };
  }, [activePath, cwd, sessionKey]);

  useEffect(() => {
    if (!cwd || !activePath) return;
    const unsubscribe = window.harness.onOfficeFileChanged((payload) => {
      if (payload.cwd !== cwd || payload.relativePath !== activePath) return;
      void (async () => {
        const result = await window.harness.readProjectFile({
          cwd,
          relativePath: activePath,
          sessionKey: sessionKey ?? undefined,
        });
        if (!result.ok) return;
        if (result.contents === currentMarkdownRef.current) return;
        if (isEditingRef.current) return;

        currentMarkdownRef.current = result.contents;
        persistedMarkdownRef.current = result.contents;
        setMarkdown(result.contents);
        setLoadVersion((value) => value + 1);
      })();
    });
    return unsubscribe;
  }, [activePath, cwd, sessionKey]);

  const handleCurrentMarkdownChange = useCallback((nextMarkdown: string) => {
    currentMarkdownRef.current = nextMarkdown;
  }, []);

  const shouldSaveMarkdown = useCallback((nextMarkdown: string) => {
    return nextMarkdown !== persistedMarkdownRef.current;
  }, []);

  const handleSaving = useCallback(() => {
    setSaveState("saving");
  }, []);

  const handleSaved = useCallback((_mtimeMs: number, savedMarkdown: string) => {
    persistedMarkdownRef.current = savedMarkdown;
    setSaveState("saved");
  }, []);

  if (!cwd) {
    return <div className="project-explorer-placeholder">Open a work project to edit documents.</div>;
  }

  return (
    <div className="work-mode-markdown-panel work-mode-xlsx-panel">
      {activePath ? (
        <div className="work-mode-xlsx-toolbar">
          <button
            type="button"
            className="work-mode-xlsx-icon-button"
            aria-label="Refresh document"
            title="Refresh"
            disabled={loading}
            onClick={() => {
              void loadDocument({ showLoading: true });
            }}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} />
          </button>
          <span className="work-mode-xlsx-filename" title={activePath}>
            {documentFileName(activePath)}
          </span>
          <span className="work-mode-markdown-save-state" aria-live="polite">
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : null}
          </span>
        </div>
      ) : null}

      <div className="work-mode-markdown-editor-shell" ref={editorContainerRef}>
        {!activePath ? (
          <div className="project-explorer-placeholder work-mode-xlsx-empty">
            <p>
              <strong>Open a file in composer</strong> — ask the agent to read or edit a document.
            </p>
          </div>
        ) : loading ? (
          <div className="project-explorer-placeholder">Loading document…</div>
        ) : error ? (
          <div className="project-explorer-placeholder">{error}</div>
        ) : (
          <MarkdownEditorSurface
            cwd={cwd}
            sessionKey={sessionKey}
            activePath={activePath}
            enabled={!loading && !error}
            markdown={markdown}
            loadVersion={loadVersion}
            editorConfig={editorConfig}
            editorContainerRef={editorContainerRef}
            isEditingRef={isEditingRef}
            shouldSaveMarkdown={shouldSaveMarkdown}
            onCurrentMarkdownChange={handleCurrentMarkdownChange}
            onSaving={handleSaving}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  );
}
