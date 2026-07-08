import { Copy01Icon, GitForkIcon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

interface AssistantMessageActionsProps {
  content: string;
  entryId?: string;
  forkDisabled?: boolean;
  onFork?: (entryId: string) => void | Promise<void>;
}

export function AssistantMessageActions({
  content,
  entryId,
  forkDisabled = false,
  onFork,
}: AssistantMessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [forking, setForking] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures (permissions, unsupported APIs).
    }
  }

  async function handleFork() {
    if (!entryId || forkDisabled || forking || !onFork) return;
    setForking(true);
    try {
      await onFork(entryId);
    } finally {
      setForking(false);
    }
  }

  return (
    <div className="assistant-message-actions" aria-label="Assistant response actions">
      <button
        type="button"
        className={`assistant-message-action-button${copied ? " assistant-message-action-button-active" : ""}`}
        aria-label={copied ? "Copied response" : "Copy response"}
        title={copied ? "Copied" : "Copy response"}
        onClick={() => void handleCopy()}
      >
        <HugeiconsIcon icon={copied ? Tick01Icon : Copy01Icon} size={16} strokeWidth={1.75} />
      </button>
      {entryId && onFork ? (
        <button
          type="button"
          className="assistant-message-action-button"
          aria-label="Fork from here"
          title={forkDisabled ? "Fork unavailable" : "Fork from here"}
          disabled={forkDisabled || forking}
          onClick={() => void handleFork()}
        >
          <HugeiconsIcon icon={GitForkIcon} size={16} strokeWidth={1.75} />
        </button>
      ) : null}
    </div>
  );
}
