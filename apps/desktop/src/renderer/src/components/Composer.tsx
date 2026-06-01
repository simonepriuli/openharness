import { useCallback, useEffect, useRef, useState } from "react";
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
import { FileMentionChip } from "./FileMentionChip";
import { FileMentionMenu, type ProjectFile } from "./FileMentionMenu";

interface ComposerProps {
  segments: ComposerSegment[];
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  onSend: () => void;
  onAbort: () => void;
  disabled: boolean;
  isStreaming: boolean;
  projectReady: boolean;
  contextRefreshKey?: number;
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

function IconMic() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M19 11v1a7 7 0 0 1-14 0v-1M12 18v3M8 21h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
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
  segments,
  onSegmentsChange,
  onSend,
  onAbort,
  disabled,
  isStreaming,
  projectReady,
  contextRefreshKey = 0,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionContextKeyRef = useRef<string | null>(null);
  const [mention, setMention] = useState<MentionRange | null>(null);
  const [mentionFiles, setMentionFiles] = useState<ProjectFile[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const contextUsage = useContextUsage(projectReady, contextRefreshKey);

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
      if (!disabled && serialized) onSend();
    }
  };

  const canSend = !disabled && serialized.length > 0;
  const showSteerSend = isStreaming && canSend;

  const focusTextarea = () => {
    textareaRef.current?.focus();
  };

  return (
    <footer className="composer">
      <div
        className={`composer-box${disabled ? " composer-box-disabled" : ""}${isStreaming ? " composer-box-streaming" : ""}`}
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
                      segments.length === 1 && !segment.value
                        ? disabled
                          ? "Open a folder to start…"
                          : "Ask for follow-up changes"
                        : undefined
                    }
                    value={segment.value}
                    onChange={handleChange}
                    onClick={(e) => e.stopPropagation()}
                    onKeyUp={handleKeyUp}
                    onKeyDown={handleKeyDown}
                    onInput={resize}
                    disabled={disabled}
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
            {projectReady && (
              <ComposerProgress
                percentUsed={contextUsage?.percent ?? null}
                tokens={contextUsage?.tokens ?? null}
                contextWindow={contextUsage?.contextWindow ?? 200_000}
              />
            )}
          </div>
          <div className="composer-toolbar-right">
            {isStreaming ? (
              <>
                <button
                  type="button"
                  className="composer-icon-btn"
                  title="Voice input"
                  disabled
                  aria-disabled
                >
                  <IconMic />
                </button>
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
