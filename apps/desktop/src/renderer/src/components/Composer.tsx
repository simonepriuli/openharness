import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { LeftToRightListBulletIcon, SwarmIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { LexicalEditor } from "lexical";
import type { HarnessState } from "../../../preload/api";
import type { PendingQuestionState } from "../lib/pending-question";
import type { StoredAttachedRoot } from "../lib/chat-db";
import type { SlashMenuAction, SlashMenuItem } from "../../../shared/thread-tools";
import {
  hasDraftContent,
  insertExternalMentionInDraft,
  removeImageBeforeTrailing,
  removeImageSegment,
  stripTrailingSlashCommand,
  type ComposerSegment,
  type ImageSegment,
} from "../lib/composer-draft";
import { getTrailingEditorText } from "../lib/lexical-draft";
import { processComposerDrop } from "../lib/composer-drop";
import { addClipboardImageToDraft } from "../lib/image-attachment";
import { useContextUsage } from "../hooks/useContextUsage";
import { ComposerProgress } from "./ComposerProgress";
import { ComposerSpend } from "./ComposerSpend";
import { ImageAttachmentChip } from "./ImageAttachmentChip";
import { ComposerQuestionPanel } from "./ComposerQuestionPanel";
import { ModelSwitcher } from "./ModelSwitcher";
import { LexicalComposerInput } from "./lexical/LexicalComposerInput";
import { AttachedRootChips } from "./AttachedRootChips";
import { ComposerPlusControl } from "./ComposerPlusMenu";
import { insertSlashMenuTool } from "../lib/insert-slash-menu-item";

interface ComposerProps {
  notice?: ReactNode;
  segments: ComposerSegment[];
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  onSend: () => void;
  onAbort: () => void;
  /** True when no project folder is selected (input cannot be used). */
  noProject: boolean;
  /** True when a project is selected but the session is not ready to accept prompts. */
  sessionPending: boolean;
  /** True when an API key must be configured before sending. */
  apiKeyRequired?: boolean;
  isStreaming: boolean;
  projectReady: boolean;
  sessionKey: string | null;
  contextRefreshKey?: number;
  visibleModelRefs?: string[];
  onModelChange?: () => void;
  onAddModels?: () => void;
  onSessionStateSynced?: (sessionKey: string, state: HarnessState | null) => void;
  swarmMode?: boolean;
  onToggleSwarmMode?: () => void;
  planMode?: boolean;
  onAbortPlanMode?: () => void;
  onCycleComposerMode?: () => void;
  onSelectComposerMode?: (mode: "plan" | "swarm") => void;
  hideComposerModes?: boolean;
  landingLayout?: boolean;
  /** Allow send before a session exists (landing create-then-send flow). */
  preSessionSend?: boolean;
  emptyPlaceholder?: string;
  pendingQuestion?: PendingQuestionState | null;
  onQuestionPickOption?: (optionId: string) => void;
  onQuestionPrevious?: () => void;
  onQuestionSkip?: () => void;
  onQuestionNext?: () => void;
  attachedRoots?: StoredAttachedRoot[];
  onRemoveAttachedRoot?: (rootId: string) => void;
  onAttachExternalRoots?: (roots: StoredAttachedRoot[]) => void | Promise<void>;
  onExternalFileMentioned?: (absolutePath: string) => void;
  conversationContext?: "coding" | "work" | "work-project";
  /** Show context usage and spend after the first message has been sent. */
  hasMessages?: boolean;
}

function IconArrowUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 19V5M12 5l-6 6M12 5l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

export function Composer({
  notice,
  segments,
  onSegmentsChange,
  onSend,
  onAbort,
  noProject,
  sessionPending,
  apiKeyRequired = false,
  isStreaming,
  projectReady,
  sessionKey,
  contextRefreshKey = 0,
  visibleModelRefs = [],
  onModelChange,
  onAddModels,
  onSessionStateSynced,
  swarmMode = false,
  onToggleSwarmMode,
  planMode = false,
  onAbortPlanMode,
  onCycleComposerMode,
  onSelectComposerMode,
  hideComposerModes = false,
  landingLayout = false,
  preSessionSend = false,
  emptyPlaceholder,
  pendingQuestion = null,
  onQuestionPickOption,
  onQuestionPrevious,
  onQuestionSkip,
  onQuestionNext,
  attachedRoots = [],
  onRemoveAttachedRoot,
  onAttachExternalRoots,
  onExternalFileMentioned,
  conversationContext,
  hasMessages = false,
}: ComposerProps) {
  const editorRef = useRef<LexicalEditor | null>(null);
  const menuPortalRef = useRef<HTMLDivElement>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [slashMenuItems, setSlashMenuItems] = useState<SlashMenuItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isInputMultiline, setIsInputMultiline] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const contextUsage = useContextUsage(projectReady, sessionKey, contextRefreshKey);

  const trailingText = getTrailingEditorText(segments);
  const imageSegments = segments.filter((segment): segment is ImageSegment => segment.type === "image");
  const hasImages = imageSegments.length > 0;

  const inputDisabled = noProject;
  const workModeDropEnabled =
    (conversationContext === "work" || conversationContext === "work-project") &&
    Boolean(onAttachExternalRoots) &&
    !inputDisabled;

  const loadSlashItems = useCallback(async (): Promise<SlashMenuItem[]> => {
    if (!sessionKey) return [];
    const result = await window.harness.getSlashCommands({ sessionKey });
    return result.items;
  }, [sessionKey]);

  useEffect(() => {
    if (!sessionKey || !projectReady) {
      setSlashMenuItems([]);
      return;
    }

    let cancelled = false;
    void window.harness
      .getSlashCommands({ sessionKey })
      .then((result) => {
        if (!cancelled) setSlashMenuItems(result.items);
      })
      .catch((err) => {
        console.error("[composer] slash preload failed:", err);
        if (!cancelled) setSlashMenuItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionKey, projectReady]);

  useEffect(() => {
    const root = editorRef.current?.getRootElement();
    if (!root) {
      setIsInputMultiline(false);
      return;
    }
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(root).lineHeight) || 24;
      const wraps = root.scrollHeight > lineHeight * 1.5;
      setIsInputMultiline((prev) => {
        if (wraps) return true;
        // Avoid flicker at the threshold: switching back to the compact (narrower)
        // layout can make the text wrap again. Only collapse once the input is empty.
        const isEmpty = (root.textContent ?? "").trim().length === 0;
        return isEmpty ? false : prev;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [segments]);

  const handleAttachAction = useCallback(
    async (_action: SlashMenuAction) => {
      if (!onAttachExternalRoots) return;
      const result = await window.harness.pickExternalPaths({ multi: true });
      if (result.canceled || result.paths.length === 0) return;

      const folderRoots = result.paths.filter((root) => root.kind === "folder");
      const fileRoots = result.paths.filter((root) => root.kind === "file");

      if (folderRoots.length > 0) {
        await onAttachExternalRoots(folderRoots);
      }

      let nextSegments = stripTrailingSlashCommand(segments);
      for (const root of fileRoots) {
        nextSegments = insertExternalMentionInDraft(nextSegments, root.absolutePath);
        onExternalFileMentioned?.(root.absolutePath);
      }
      if (nextSegments !== segments) {
        onSegmentsChange(nextSegments);
      }
    },
    [onAttachExternalRoots, onExternalFileMentioned, onSegmentsChange, segments],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!workModeDropEnabled) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      if (event.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [workModeDropEnabled],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!workModeDropEnabled) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [workModeDropEnabled],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!workModeDropEnabled) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragOver(false);
      }
    },
    [workModeDropEnabled],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!workModeDropEnabled || !onAttachExternalRoots) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) return;

      void processComposerDrop({
        files,
        segments,
        getPathForFile: (file) => window.harness.getPathForFile(file),
        attachedRootsFromPaths: (paths) => window.harness.attachedRootsFromPaths(paths),
      })
        .then(async ({ segments: nextSegments, attachedRoots, mentionedFilePaths }) => {
          if (attachedRoots.length > 0) {
            await onAttachExternalRoots(attachedRoots);
          }
          for (const absolutePath of mentionedFilePaths) {
            onExternalFileMentioned?.(absolutePath);
          }
          if (nextSegments !== segments) {
            onSegmentsChange(nextSegments);
          }
        })
        .catch((err) => {
          console.error("[composer] file drop failed:", err);
        });
    },
    [workModeDropEnabled, onAttachExternalRoots, onExternalFileMentioned, onSegmentsChange, segments],
  );

  const handlePaste = (e: ClipboardEvent) => {
    if (inputDisabled) return;

    const hasImageItem = Array.from(e.clipboardData?.items ?? []).some((item) =>
      item.type.startsWith("image/"),
    );
    if (!hasImageItem || !e.clipboardData) return;

    e.preventDefault();
    void addClipboardImageToDraft(segments, e.clipboardData)
      .then((nextSegments) => {
        if (nextSegments) onSegmentsChange(nextSegments);
      })
      .catch((err) => {
        console.error("[composer] image paste failed:", err);
      });
  };

  const canSend =
    !noProject &&
    !apiKeyRequired &&
    hasDraftContent(segments) &&
    (preSessionSend || !sessionPending);
  const showSteerSend = isStreaming && canSend;

  const handleComposerKeyDown = (e: KeyboardEvent) => {
    if (pendingQuestion && !inputDisabled) {
      const question = pendingQuestion.questions[pendingQuestion.currentQuestionIndex];
      const options = question?.options ?? [];
      const selectedOptionId = question?.selectedOptionIds[0];
      const selectedIndex = selectedOptionId
        ? options.findIndex((option) => option.id === selectedOptionId)
        : -1;
      const key = e.key.toLowerCase();
      if (!e.metaKey && !e.ctrlKey && !e.altKey && key.length === 1) {
        const alpha = key.charCodeAt(0) - 97;
        if (alpha >= 0 && question?.options[alpha]) {
          e.preventDefault();
          onQuestionPickOption?.(question.options[alpha].id);
          return;
        }
      }

      if (
        (e.key === "ArrowUp" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowRight") &&
        options.length > 0
      ) {
        e.preventDefault();
        const isBackward = e.key === "ArrowUp" || e.key === "ArrowLeft";
        const fallbackIndex = isBackward ? options.length : -1;
        const startIndex = selectedIndex >= 0 ? selectedIndex : fallbackIndex;
        const delta = isBackward ? -1 : 1;
        const nextIndex = (startIndex + delta + options.length) % options.length;
        const nextOption = options[nextIndex];
        if (nextOption) onQuestionPickOption?.(nextOption.id);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (!question || question.selectedOptionIds.length === 0) return;
        e.preventDefault();
        onQuestionNext?.();
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "s") {
      if (hideComposerModes) return;
      e.preventDefault();
      onToggleSwarmMode?.();
      return;
    }

    if (e.key === "Tab" && e.shiftKey) {
      if (hideComposerModes) return;
      e.preventDefault();
      onCycleComposerMode?.();
      return;
    }

    if (e.key === "Backspace" && trailingText === "") {
      const prev = segments[segments.length - 2];
      if (prev?.type === "image") {
        e.preventDefault();
        onSegmentsChange(removeImageBeforeTrailing(segments));
        return;
      }
    }
  };

  const emptyStatePlaceholder =
    emptyPlaceholder ??
    (landingLayout
      ? hideComposerModes
        ? "Research, write, deliver, / for skills, @ for context"
        : "Plan, build, / for skills, @ for context"
      : noProject
        ? "Open a folder to start…"
        : "Ask for follow-up changes");
  const showContextGauge = hasMessages && contextUsage?.percent != null;
  const showSpend = hasMessages && projectReady && contextUsage;
  const showPlanChip = planMode && !hideComposerModes;
  const showSwarmChip = swarmMode && !hideComposerModes;
  const isCompactLayout = !hasMessages && !hasImages && !isInputMultiline;
  const swarmAvailable = projectReady && Boolean(sessionKey);

  const handlePlusMenuToolSelect = useCallback(
    (item: SlashMenuItem) => {
      const editor = editorRef.current;
      if (!editor) return;
      insertSlashMenuTool(editor, item);
      setIsPlusMenuOpen(false);
      editor.focus();
    },
    [],
  );

  const handlePlusMenuAttach = useCallback(() => {
    void handleAttachAction("attach-file-or-folder");
  }, [handleAttachAction]);

  const handleSelectComposerMode = useCallback(
    (mode: "plan" | "swarm") => {
      onSelectComposerMode?.(mode);
    },
    [onSelectComposerMode],
  );

  const plusControl = (
    <ComposerPlusControl
      open={isPlusMenuOpen}
      onOpenChange={setIsPlusMenuOpen}
      disabled={inputDisabled}
      planMode={planMode}
      swarmMode={swarmMode}
      hideComposerModes={hideComposerModes}
      swarmAvailable={swarmAvailable}
      conversationContext={conversationContext}
      slashMenuItems={slashMenuItems}
      loading={projectReady && Boolean(sessionKey) && slashMenuItems.length === 0}
      onSelectMode={handleSelectComposerMode}
      onAttachFileOrFolder={handlePlusMenuAttach}
      onSelectTool={handlePlusMenuToolSelect}
    />
  );

  const focusEditor = () => {
    if (inputDisabled) return;
    editorRef.current?.focus();
  };

  return (
    <footer
      className={`composer${notice ? " composer-has-notice" : ""}${apiKeyRequired ? " composer-needs-key" : ""}`}
    >
      {pendingQuestion && (
        <div className="composer-question-host">
          <ComposerQuestionPanel
            state={pendingQuestion}
            disabled={inputDisabled || sessionPending || apiKeyRequired}
            onPickOption={(optionId) => onQuestionPickOption?.(optionId)}
            onPrevious={() => onQuestionPrevious?.()}
            onSkip={() => onQuestionSkip?.()}
            onNext={() => onQuestionNext?.()}
          />
        </div>
      )}
      {notice}
      <AttachedRootChips roots={attachedRoots} onRemove={(rootId) => onRemoveAttachedRoot?.(rootId)} />
      <div
        ref={composerBoxRef}
        className={`composer-box${isCompactLayout ? " composer-box-compact" : ""}${noProject ? " composer-box-disabled" : ""}${isStreaming ? " composer-box-streaming" : ""}${isDragOver ? " composer-box-drag-over" : ""}${isPlusMenuOpen ? " composer-box-plus-open" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isCompactLayout ? plusControl : null}
        <div className="composer-input-wrap" ref={menuPortalRef} onClick={focusEditor}>
          {hasImages && (
            <div
              className="composer-image-attachments"
              onClick={(event) => event.stopPropagation()}
            >
              {imageSegments.map((segment) => (
                <ImageAttachmentChip
                  key={segment.id}
                  previewUrl={segment.previewUrl}
                  mimeType={segment.mimeType}
                  onRemove={() => onSegmentsChange(removeImageSegment(segments, segment.id))}
                />
              ))}
            </div>
          )}
          <LexicalComposerInput
            segments={segments}
            onSegmentsChange={onSegmentsChange}
            loadItems={loadSlashItems}
            cachedSlashItems={slashMenuItems}
            disabled={inputDisabled}
            placeholder={!trailingText ? emptyStatePlaceholder : undefined}
            toolPickerEnabled={projectReady && Boolean(sessionKey)}
            mentionEnabled={projectReady}
            sessionKey={sessionKey}
            editorRef={editorRef}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            onSelectAttachAction={
              conversationContext === "work" || conversationContext === "work-project"
                ? handleAttachAction
                : undefined
            }
            canEnterSend={canSend}
            onEnterSend={onSend}
            menuPortalRef={menuPortalRef}
          />
        </div>
        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
            {!isCompactLayout ? plusControl : null}
            {showContextGauge && (
              <ComposerProgress
                percentUsed={projectReady ? (contextUsage?.percent ?? null) : null}
                tokens={projectReady ? (contextUsage?.tokens ?? null) : null}
                contextWindow={
                  projectReady ? (contextUsage?.contextWindow ?? 200_000) : 200_000
                }
                tokenStats={projectReady ? contextUsage?.tokenStats : undefined}
              />
            )}
            {showSpend && (
              <ComposerSpend cost={contextUsage.cost ?? 0} />
            )}
            {showPlanChip && (
              <span className="composer-mode-chip composer-mode-chip-plan">
                <span className="composer-mode-chip-icon">
                  <HugeiconsIcon
                    icon={LeftToRightListBulletIcon}
                    size={12}
                    strokeWidth={1.7}
                    aria-hidden
                  />
                </span>
                Plan
                <button
                  type="button"
                  className="composer-mode-chip-close"
                  title="Exit Plan mode (aborts interview and deletes draft plan)"
                  aria-label="Exit Plan mode"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAbortPlanMode?.();
                  }}
                >
                  <svg viewBox="0 0 10 10" aria-hidden>
                    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            )}
            {showSwarmChip && (
              <span className="composer-mode-chip composer-mode-chip-swarm">
                <span className="composer-mode-chip-icon">
                  <HugeiconsIcon icon={SwarmIcon} size={12} strokeWidth={1.7} aria-hidden />
                </span>
                Swarm
                <button
                  type="button"
                  className="composer-mode-chip-close"
                  title="Disable Swarm mode"
                  aria-label="Disable Swarm mode"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleSwarmMode?.();
                  }}
                >
                  <svg viewBox="0 0 10 10" aria-hidden>
                    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            )}
          </div>
          <div className="composer-toolbar-right">
            <ModelSwitcher
              sessionKey={sessionKey}
              disabled={inputDisabled || sessionPending || !sessionKey}
              visibleModelRefs={visibleModelRefs}
              onModelChange={onModelChange}
              onAddModels={onAddModels}
              onSessionStateSynced={onSessionStateSynced}
            />
            {isStreaming ? (
              <>
                <button
                  type="button"
                  className="composer-stop-btn"
                  title="Stop"
                  onClick={onAbort}
                >
                  <IconStop />
                </button>
                {showSteerSend && (
                  <button
                    type="button"
                    className="composer-send composer-send-active"
                    title="Send follow-up"
                    onClick={onSend}
                  >
                    <IconArrowUp />
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className={`composer-send${canSend ? " composer-send-active" : ""}`}
                title="Send"
                onClick={onSend}
                disabled={!canSend}
              >
                <IconArrowUp />
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}

export { createEmptyDraft } from "../lib/composer-draft";
