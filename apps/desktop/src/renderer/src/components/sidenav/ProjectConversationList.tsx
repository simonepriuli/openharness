import { useEffect, useMemo, useState } from "react";
import type { ConversationSummary } from "../../../../preload/api";
import { listConversationsFromStorage } from "../../lib/chat-storage";
import { formatRelativeShort } from "../../lib/formatRelativeShort";

const VISIBLE_CONVERSATION_COUNT = 5;

type ProjectConversationListProps = {
  cwd: string;
  expanded: boolean;
  selectedSessionFile: string | null;
  selectedConversationId: string | null;
  refreshKey: number;
  onSelectConversation: (conversation: ConversationSummary) => void;
};

export function ProjectConversationList({
  cwd,
  expanded,
  selectedSessionFile,
  selectedConversationId,
  refreshKey,
  onSelectConversation,
}: ProjectConversationListProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
  }, [cwd, refreshKey]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listConversationsFromStorage(cwd)
      .then((rows) => {
        if (!cancelled) setConversations(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setConversations([]);
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
            const rel = formatRelativeShort(conversation.updatedAt);
            const selected = conversation.sessionFile
              ? selectedSessionFile === conversation.sessionFile
              : selectedConversationId === conversation.sessionId;
            return (
              <li key={conversation.sessionId}>
                <button
                  type="button"
                  className={`app-region-no-drag flex h-10 w-full items-center gap-2 rounded-md pl-7 pr-2 text-left text-xs transition-colors hover:bg-slate-900/10 ${
                    selected ? "bg-slate-900/10 text-slate-900" : "text-slate-700"
                  }`}
                  onClick={() => onSelectConversation(conversation)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{conversation.title}</span>
                  {rel ? (
                    <span
                      className="shrink-0 tabular-nums text-[10px] text-slate-400"
                      title={conversation.updatedAt}
                    >
                      {rel}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {hasMore ? (
            <li>
              <button
                type="button"
                className="app-region-no-drag flex h-10 w-full items-center rounded-md pl-7 pr-2 text-left text-[11px] font-medium text-slate-500 hover:bg-slate-900/10 hover:text-slate-800"
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
