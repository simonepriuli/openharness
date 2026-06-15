import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SwarmIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HarnessState } from "../../../preload/api";
import type { PendingQuestionState } from "../lib/pending-question";
import {
  getTrailingTextSegment,
  insertMentionInDraft,
  removeMentionBeforeTrailing,
  serializeDraft,
  updateTrailingText,
  type ComposerSegment,
} from "../lib/composer-draft";
import { getMentionAtCursor, type MentionRange } from "../lib/file-mention";
import { useContextUsage } from "../hooks/useContextUsage";
import { ComposerProgress } from "./ComposerProgress";
import { ComposerSpend } from "./ComposerSpend";
import { FileMentionChip } from "./FileMentionChip";
import { FileMentionMenu, type ProjectFile } from "./FileMentionMenu";
import { ComposerQuestionPanel } from "./ComposerQuestionPanel";
import { ModelSwitcher } from "./ModelSwitcher";

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
  pendingQuestion?: PendingQuestionState | null;
  onQuestionPickOption?: (optionId: string) => void;
  onQuestionPrevious?: () => void;
  onQuestionSkip?: () => void;
  onQuestionNext?: () => void;
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
  pendingQuestion = null,
  onQuestionPickOption,
  onQuestionPrevious,
  onQuestionSkip,
  onQuestionNext,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionContextKeyRef = useRef<string | null>(null);
  const [mention, setMention] = useState<MentionRange | null>(null);
  const [mentionFiles, setMentionFiles] = useState<ProjectFile[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const contextUsage = useContextUsage(projectReady, sessionKey, contextRefreshKey);

  const trailingText = getTrailingTextSegment(segments).value;
  const serialized = serializeDraft(segments);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [trailingText, segments, resize]);

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
        .searchFiles({ query })
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
  }, [mentionOpen, mention?.query, projectReady]);

  const selectFile = useCallback(
    (file: ProjectFile) => {
      const el = textareaRef.current;
      if (!el || !mention) return;

      const { segments: nextSegments, cursor } = insertMentionInDraft(
        segments,
        mention,
        file.relativePath,
      );
      onSegmentsChange(nextSegments);
      closeMention();

      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    },
    [mention, segments, onSegmentsChange, closeMention],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onSegmentsChange(updateTrailingText(segments, next));
    syncMentionFromCursor(next, e.target.selectionStart ?? next.length, { resetIndex: true });
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") return;
    syncMentionFromCursor(
      trailingText,
      e.currentTarget.selectionStart ?? trailingText.length,
      { resetIndex: true },
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      e.preventDefault();
      onToggleSwarmMode?.();
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

    if (e.key === "Backspace" && trailingText === "" && segments.some((s) => s.type === "mention")) {
      e.preventDefault();
      onSegmentsChange(removeMentionBeforeTrailing(segments));
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  const inputDisabled = noProject;
  const canSend =
    !noProject && !sessionPending && !apiKeyRequired && serialized.length > 0;
  const showSteerSend = isStreaming && canSend;

  const emptyPlaceholder = noProject ? "Open a folder to start…" : "Ask for follow-up changes";
  const showContextGauge = contextUsage?.percent != null;

  const focusTextarea = () => {
    if (inputDisabled) return;
    textareaRef.current?.focus();
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
      <div
        className={`composer-box${noProject ? " composer-box-disabled" : ""}${isStreaming ? " composer-box-streaming" : ""}`}
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
          <div className="composer-input-content">
            {segments.map((segment, index) => {
              if (segment.type === "mention") {
                return <FileMentionChip key={segment.id} relativePath={segment.relativePath} />;
              }
              const isTrailing = index === segments.length - 1;
              if (isTrailing) {
                return (
                  <textarea
                    key="composer-textarea"
                    ref={textareaRef}
                    className="composer-input composer-input-inline"
                    placeholder={
                      segments.length === 1 && !segment.value ? emptyPlaceholder : undefined
                    }
                    value={segment.value}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()}
                    onKeyUp={handleKeyUp}
                    onKeyDown={handleKeyDown}
                    onInput={resize}
                    disabled={inputDisabled}
                    rows={1}
                  />
                );
              }
              if (!segment.value) return null;
              return (
                <span key={`text-${index}`} className="composer-text-fragment">
                  {segment.value}
                </span>
              );
            })}
          </div>
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
            {swarmMode && (
              <span className="composer-mode-chip">
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
