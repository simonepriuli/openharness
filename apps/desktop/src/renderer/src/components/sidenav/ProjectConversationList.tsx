import { memo, useEffect, useMemo, useState } from "react";
import type { ConversationSummary } from "../../../../preload/api";
import { listConversationsFromStorage } from "../../lib/chat-storage";
import { isStreamingConversation } from "../../lib/is-streaming-conversation";
import { ConversationListRow } from "./ConversationListRow";

const VISIBLE_CONVERSATION_COUNT = 5;

type ProjectConversationListProps = {
  cwd: string;
  expanded: boolean;
  selectedSessionFile: string | null;
  selectedConversationId: string | null;
  refreshKey: number;
  streamingConversationIds: ReadonlySet<string>;
  onSelectConversation: (projectCwd: string, conversation: ConversationSummary) => void;
  onArchiveConversation: (projectCwd: string, conversation: ConversationSummary) => void;
};

function ProjectConversationListInner({
  cwd,
  expanded,
  selectedSessionFile,
  selectedConversationId,
  refreshKey,
  streamingConversationIds,
  onSelectConversation,
  onArchiveConversation,
}: ProjectConversationListProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
  }, [cwd]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const showLoadingPlaceholder = conversations.length === 0;
    if (showLoadingPlaceholder) {
      setLoading(true);
      setError(null);
    }
    void listConversationsFromStorage(cwd)
      .then((rows) => {
        if (!cancelled) setConversations(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          if (showLoadingPlaceholder) setConversations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, expanded, refreshKey]);

  const visible = useMemo(() => {
    if (showAll || conversations.length <= VISIBLE_CONVERSATION_COUNT) return conversations;
    return conversations.slice(0, VISIBLE_CONVERSATION_COUNT);
  }, [conversations, showAll]);

  const hasMore = conversations.length > VISIBLE_CONVERSATION_COUNT;

  if (!expanded) return null;

  return (
    <ul className="mt-0.5 space-y-0.5 pb-1">
      {loading ? (
        <li className="px-7 py-1 text-xs text-slate-500">Loading…</li>
      ) : error ? (
        <li className="px-7 py-1 text-xs text-red-600">{error}</li>
      ) : conversations.length === 0 ? (
        <li className="px-7 py-1 text-xs text-slate-500">No conversations yet.</li>
      ) : (
        <>
          {visible.map((conversation) => {
            const selected = conversation.sessionFile
              ? selectedSessionFile === conversation.sessionFile
              : selectedConversationId === conversation.sessionId;
            const streaming = isStreamingConversation(conversation, streamingConversationIds);
            return (
              <ConversationListRow
                key={conversation.sessionId}
                conversation={conversation}
                selected={selected}
                streaming={streaming}
                onSelect={() => onSelectConversation(cwd, conversation)}
                onArchive={() => onArchiveConversation(cwd, conversation)}
              />
            );
          })}
          {hasMore ? (
            <li>
              <button
                type="button"
                className="app-region-no-drag flex h-10 w-full items-center rounded-md pl-10 pr-2 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-900/10 hover:text-slate-800"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? "Show less"
                  : `Show more (${conversations.length - VISIBLE_CONVERSATION_COUNT})`}
              </button>
            </li>
          ) : null}
        </>
      )}
    </ul>
  );
}

export const ProjectConversationList = memo(ProjectConversationListInner);
