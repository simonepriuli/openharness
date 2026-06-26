import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type { SlashMenuAction, SlashMenuItem } from "../../../shared/thread-tools";
import { getSlashAtCursor, listSelectableSlashMenuItems } from "../../../shared/thread-tools";
import {
  ensureTrailingText,
  getSlashInDraft,
  getTrailingTextSegment,
  insertToolInDraft,
  removeToolBeforeTrailing,
  updateTrailingText,
  type ComposerSegment,
} from "../lib/composer-draft";
import { ToolChip } from "./ToolChip";
import { ToolPickerMenu } from "./ToolPickerMenu";

export type SlashToolInputProps = {
  segments: ComposerSegment[];
  onSegmentsChange: (segments: ComposerSegment[]) => void;
  loadItems: () => Promise<SlashMenuItem[]>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  minRows?: number;
  maxHeight?: number;
  /** Inline prefix overlays the first line (composer). Stacked prefix scrolls with text (multiline editors). */
  prefixLayout?: "inline" | "stacked";
  toolPickerEnabled?: boolean;
  suppressToolPicker?: boolean;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  renderLeadingSegment?: (segment: ComposerSegment, index: number) => ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTrailingTextChange?: (text: string, cursor: number) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSelectAttachAction?: (action: SlashMenuAction) => void;
};

function defaultRenderLeadingSegment(segment: ComposerSegment, index: number): ReactNode {
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
}

export function SlashToolInput({
  segments,
  onSegmentsChange,
  loadItems,
  placeholder,
  className,
  inputClassName,
  disabled = false,
  minRows = 1,
  maxHeight = 160,
  prefixLayout = "inline",
  toolPickerEnabled = true,
  suppressToolPicker = false,
  textareaRef: externalTextareaRef,
  renderLeadingSegment = defaultRenderLeadingSegment,
  onKeyDown,
  onTrailingTextChange,
  onPaste,
  onSelectAttachAction,
}: SlashToolInputProps) {
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalTextareaRef ?? internalTextareaRef;
  const prefixRef = useRef<HTMLDivElement>(null);
  const toolContextKeyRef = useRef<string | null>(null);
  const [toolItems, setToolItems] = useState<SlashMenuItem[]>([]);
  const [toolQuery, setToolQuery] = useState("");
  const [toolIndex, setToolIndex] = useState(0);
  const [toolLoading, setToolLoading] = useState(false);
  const [toolOpen, setToolOpen] = useState(false);
  const [prefixWidth, setPrefixWidth] = useState(0);

  const trailingIndex = segments.length - 1;
  const trailingSegment = segments[trailingIndex];
  const leadingSegments = useMemo(
    () =>
      segments.slice(0, trailingIndex).filter((segment) => {
        if (segment.type === "image") return false;
        if (segment.type === "text" && !segment.value) return false;
        return true;
      }),
    [segments, trailingIndex],
  );
  const hasPrefix = leadingSegments.length > 0;
  const trailingText = getTrailingTextSegment(segments).value;

  useLayoutEffect(() => {
    const element = prefixRef.current;
    if (!element || !hasPrefix) {
      setPrefixWidth(0);
      return;
    }

    const measure = () => {
      const width = element.offsetWidth;
      setPrefixWidth(width > 0 ? width + 4 : 0);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasPrefix, leadingSegments, segments]);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (prefixLayout === "stacked") {
      el.style.height = `${el.scrollHeight}px`;
      return;
    }
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [maxHeight, prefixLayout, textareaRef]);

  useEffect(() => {
    resize();
  }, [trailingText, segments, resize]);

  const closeToolPicker = useCallback(() => {
    setToolOpen(false);
    setToolQuery("");
    setToolIndex(0);
    toolContextKeyRef.current = null;
  }, []);

  const syncToolPickerFromCursor = useCallback(
    (text: string, cursor: number, options?: { resetIndex?: boolean }) => {
      if (!toolPickerEnabled || suppressToolPicker) {
        closeToolPicker();
        return;
      }
      const active = getSlashAtCursor(text, cursor);
      if (!active) {
        closeToolPicker();
        return;
      }
      const contextKey = `${active.start}:${active.query}`;
      if (options?.resetIndex !== false && toolContextKeyRef.current !== contextKey) {
        setToolIndex(0);
        toolContextKeyRef.current = contextKey;
      }
      setToolQuery(active.query);
      setToolOpen(true);
    },
    [toolPickerEnabled, suppressToolPicker, closeToolPicker],
  );

  useEffect(() => {
    if (!toolOpen || !toolPickerEnabled || suppressToolPicker) {
      setToolLoading(false);
      return;
    }

    let cancelled = false;
    setToolLoading(true);
    const timer = window.setTimeout(() => {
      void Promise.resolve()
        .then(() => loadItems())
        .then((items) => {
          if (cancelled) return;
          setToolItems(items);
          setToolIndex(0);
        })
        .catch((err) => {
          console.error("[slash-tool-input] load failed:", err);
          if (!cancelled) setToolItems([]);
        })
        .finally(() => {
          if (!cancelled) setToolLoading(false);
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setToolLoading(false);
    };
  }, [toolOpen, toolPickerEnabled, suppressToolPicker, loadItems]);

  const selectTool = useCallback(
    (item: SlashMenuItem) => {
      const el = textareaRef.current;
      const slash = getSlashInDraft(segments, el?.selectionStart ?? trailingText.length);
      if (!slash) return;

      if (item.action) {
        onSelectAttachAction?.(item.action);
        closeToolPicker();
        if (slash.start === 0 && slash.end === trailingText.length) {
          onSegmentsChange(updateTrailingText(segments, ""));
        } else {
          const normalized = ensureTrailingText(segments);
          const lastIndex = normalized.length - 1;
          const textSeg = normalized[lastIndex] as { type: "text"; value: string };
          const before = textSeg.value.slice(0, slash.start);
          const after = textSeg.value.slice(slash.end);
          onSegmentsChange([
            ...normalized.slice(0, lastIndex),
            { type: "text", value: before + after },
          ]);
        }
        requestAnimationFrame(() => el?.focus());
        return;
      }

      const { segments: nextSegments, cursor } = insertToolInDraft(segments, slash, item);
      onSegmentsChange(nextSegments);
      closeToolPicker();

      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(cursor, cursor);
      });
    },
    [
      segments,
      onSegmentsChange,
      closeToolPicker,
      trailingText.length,
      textareaRef,
      onSelectAttachAction,
    ],
  );

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    const cursor = event.target.selectionStart ?? next.length;
    onSegmentsChange(updateTrailingText(segments, next));
    onTrailingTextChange?.(next, cursor);
    syncToolPickerFromCursor(next, cursor, { resetIndex: true });
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") return;
    const cursor = event.currentTarget.selectionStart ?? trailingText.length;
    syncToolPickerFromCursor(trailingText, cursor, { resetIndex: true });
    onTrailingTextChange?.(trailingText, cursor);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const selectableItems = listSelectableSlashMenuItems(toolItems, toolQuery);

    if (toolOpen && selectableItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setToolIndex((index) => (index + 1) % selectableItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setToolIndex((index) => (index - 1 + selectableItems.length) % selectableItems.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        const item = selectableItems[toolIndex];
        if (item) selectTool(item);
        return;
      }
    }

    if (event.key === "Escape" && toolOpen) {
      event.preventDefault();
      closeToolPicker();
      return;
    }

    if (event.key === "Backspace" && trailingText === "") {
      const prev = segments[segments.length - 2];
      if (prev?.type === "tool") {
        event.preventDefault();
        onSegmentsChange(removeToolBeforeTrailing(segments));
        return;
      }
    }

    onKeyDown?.(event);
  };

  const focusTextarea = () => {
    if (disabled) return;
    textareaRef.current?.focus();
  };

  const leadingContent =
    hasPrefix &&
    leadingSegments.map((segment, index) => renderLeadingSegment(segment, index));

  const textareaElement =
    trailingSegment?.type === "text" ? (
      <textarea
        ref={textareaRef}
        className={`composer-input composer-input-inline${
          prefixLayout === "inline" && hasPrefix && prefixWidth > 0 ? " composer-input-has-prefix" : ""
        }${inputClassName ? ` ${inputClassName}` : ""}${prefixLayout === "stacked" ? " slash-tool-input-stacked-textarea" : ""}`}
        placeholder={!trailingSegment.value ? placeholder : undefined}
        value={trailingSegment.value}
        onChange={handleChange}
        onClick={(event) => event.stopPropagation()}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onInput={resize}
        disabled={disabled}
        rows={minRows}
      />
    ) : null;

  return (
    <div className={className} onClick={focusTextarea}>
      {toolOpen && !suppressToolPicker && (
        <ToolPickerMenu
          items={toolItems}
          query={toolQuery}
          selectedIndex={toolIndex}
          loading={toolLoading}
          onSelect={selectTool}
        />
      )}
      {prefixLayout === "stacked" ? (
        <div
          className="slash-tool-input-scroll"
          style={{ maxHeight: maxHeight > 0 ? `${maxHeight}px` : undefined }}
        >
          {leadingContent ? (
            <div className="slash-tool-input-leading">{leadingContent}</div>
          ) : null}
          {textareaElement}
        </div>
      ) : (
        <div
          className={`composer-input-content${hasPrefix ? " composer-input-content-has-prefix" : ""}`}
          style={
            hasPrefix && prefixWidth > 0
              ? ({ "--composer-prefix-width": `${prefixWidth}px` } as CSSProperties)
              : undefined
          }
        >
          {leadingContent ? (
            <div ref={prefixRef} className="composer-input-prefix">
              {leadingContent}
            </div>
          ) : null}
          {textareaElement}
        </div>
      )}
    </div>
  );
}
