import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LeftToRightListBulletIcon, SwarmIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HarnessState } from "../../../preload/api";
import type { PendingQuestionState } from "../lib/pending-question";
import type { StoredAttachedRoot } from "../lib/chat-db";
import type { SlashMenuAction, SlashMenuItem } from "../../../shared/thread-tools";
import {
  getTrailingTextSegment,
  hasDraftContent,
  insertExternalMentionInDraft,
  insertMentionInDraft,
  removeImageBeforeTrailing,
  removeImageSegment,
  removeMentionBeforeTrailing,
  type ComposerSegment,
  type ImageSegment,
} from "../lib/composer-draft";
import { getMentionAtCursor, type MentionRange } from "../lib/file-mention";
import { processComposerDrop } from "../lib/composer-drop";
import { addClipboardImageToDraft } from "../lib/image-attachment";
import { useContextUsage } from "../hooks/useContextUsage";
import { ComposerProgress } from "./ComposerProgress";
import { ComposerSpend } from "./ComposerSpend";
import { FileMentionChip } from "./FileMentionChip";
import { FileMentionMenu, type ProjectFile } from "./FileMentionMenu";
import { ImageAttachmentChip } from "./ImageAttachmentChip";
import { ComposerQuestionPanel } from "./ComposerQuestionPanel";
import { ModelSwitcher } from "./ModelSwitcher";
import { SlashToolInput } from "./SlashToolInput";
import { ToolChip } from "./ToolChip";
import { AttachedRootChips } from "./AttachedRootChips";

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
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dragDepthRef = useRef(0);
  const mentionContextKeyRef = useRef<string | null>(null);
  const [mention, setMention] = useState<MentionRange | null>(null);
  const [mentionFiles, setMentionFiles] = useState<ProjectFile[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [slashMenuItems, setSlashMenuItems] = useState<SlashMenuItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const contextUsage = useContextUsage(projectReady, sessionKey, contextRefreshKey);

  const trailingText = getTrailingTextSegment(segments).value;
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

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMention(null);
    setMentionFiles([]);
    setMentionIndex(0);
    mentionContextKeyRef.current = null;
  }, []);

  const syncMentionFromCursor = useCallback(
    (text: string, cursor: number, options?: { resetIndex?: boolean }) => {
      if (!projectReady) {
        closeMention();
        return;
      }
      const active = getMentionAtCursor(text, cursor);
      if (!active) {
        closeMention();
        return;
      }
      const contextKey = `${active.start}:${active.query}`;
      if (options?.resetIndex !== false && mentionContextKeyRef.current !== contextKey) {
        setMentionIndex(0);
        mentionContextKeyRef.current = contextKey;
      }
      setMention(active);
      setMentionOpen(true);
    },
    [projectReady, closeMention],
  );

  useEffect(() => {
    if (!mentionOpen || !projectReady) return;

    let cancelled = false;
    const query = mention?.query ?? "";

    setMentionLoading(true);
    const timer = window.setTimeout(() => {
      void window.harness
        .searchFiles({ query, sessionKey: sessionKey ?? undefined })
        .then((result) => {
          if (cancelled) return;
          setMentionFiles(result.files);
          setMentionIndex(0);
        })
        .catch((err) => {
          console.error("[mention] search failed:", err);
          if (!cancelled) setMentionFiles([]);
        })
        .finally(() => {
          if (!cancelled) setMentionLoading(false);
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mentionOpen, mention?.query, projectReady, sessionKey]);

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

      let nextSegments = segments;
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

  const selectFile = useCallback(
    (file: ProjectFile) => {
      const el = textareaRef.current;
      if (!el || !mention) return;

      const { segments: nextSegments, cursor } = insertMentionInDraft(segments, mention, file);
      onSegmentsChange(nextSegments);
      closeMention();

      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    },
    [mention, segments, onSegmentsChange, closeMention],
  );

  const handleTrailingTextChange = useCallback(
    (text: string, cursor: number) => {
      syncMentionFromCursor(text, cursor, { resetIndex: true });
    },
    [syncMentionFromCursor],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (inputDisabled) return;

    const hasImageItem = Array.from(e.clipboardData.items).some((item) =>
      item.type.startsWith("image/"),
    );
    if (!hasImageItem) return;

    e.preventDefault();
    void addClipboardImageToDraft(segments, e.clipboardData)
      .then((nextSegments) => {
        if (nextSegments) onSegmentsChange(nextSegments);
      })
      .catch((err) => {
        console.error("[composer] image paste failed:", err);
      });
  };

  const handleComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    if (mentionOpen && mentionFiles.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setMentionIndex((i) => (i + 1) % mentionFiles.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setMentionIndex((i) => (i - 1 + mentionFiles.length) % mentionFiles.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const file = mentionFiles[mentionIndex];
        if (file) selectFile(file);
        return;
      }
    }

    if (e.key === "Escape" && mentionOpen) {
      e.preventDefault();
      closeMention();
      return;
    }

    if (e.key === "Backspace" && trailingText === "") {
      const prev = segments[segments.length - 2];
      if (prev?.type === "mention") {
        e.preventDefault();
        onSegmentsChange(removeMentionBeforeTrailing(segments));
        return;
      }
      if (prev?.type === "image") {
        e.preventDefault();
        onSegmentsChange(removeImageBeforeTrailing(segments));
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  const canSend =
    !noProject &&
    !apiKeyRequired &&
    hasDraftContent(segments) &&
    (preSessionSend || !sessionPending);
  const showSteerSend = isStreaming && canSend;

  const emptyStatePlaceholder =
    emptyPlaceholder ??
    (landingLayout
      ? "Plan, build, / for skills, @ for context"
      : noProject
        ? "Open a folder to start…"
        : "Ask for follow-up changes");
  const showContextGauge = contextUsage?.percent != null;

  const focusTextarea = () => {
    if (inputDisabled) return;
    textareaRef.current?.focus();
  };

  const renderLeadingSegment = (segment: ComposerSegment, index: number) => {
    if (segment.type === "mention") {
      return <FileMentionChip key={segment.id} relativePath={segment.relativePath} />;
    }
    if (segment.type === "tool") {
      return (
        <ToolChip
          key={segment.id}
          label={segment.label}
          section={segment.section}
          toolId={segment.toolId}
        />
      );
    }
    if (segment.type === "text" && segment.value) {
      return (
        <span key={`text-${index}`} className="composer-text-fragment">
          {segment.value}
        </span>
      );
    }
    return null;
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
        className={`composer-box${noProject ? " composer-box-disabled" : ""}${isStreaming ? " composer-box-streaming" : ""}${isDragOver ? " composer-box-drag-over" : ""}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {mentionOpen && (
          <FileMentionMenu
            files={mentionFiles}
            selectedIndex={mentionIndex}
            loading={mentionLoading}
            onSelect={selectFile}
          />
        )}
        <div className="composer-input-wrap" onClick={focusTextarea}>
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
          <SlashToolInput
            segments={segments}
            onSegmentsChange={onSegmentsChange}
            loadItems={loadSlashItems}
            cachedSlashItems={slashMenuItems}
            disabled={inputDisabled}
            placeholder={!trailingText ? emptyStatePlaceholder : undefined}
            toolPickerEnabled={projectReady && Boolean(sessionKey)}
            suppressToolPicker={mentionOpen}
            textareaRef={textareaRef}
            renderLeadingSegment={renderLeadingSegment}
            onTrailingTextChange={handleTrailingTextChange}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            onSelectAttachAction={
              conversationContext === "work" || conversationContext === "work-project"
                ? handleAttachAction
                : undefined
            }
          />
        </div>
        <div className="composer-toolbar">
          <div className="composer-toolbar-left">
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
            {projectReady && contextUsage && (
              <ComposerSpend cost={contextUsage.cost ?? 0} />
            )}
            {planMode && !hideComposerModes && (
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
            {swarmMode && !hideComposerModes && (
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
