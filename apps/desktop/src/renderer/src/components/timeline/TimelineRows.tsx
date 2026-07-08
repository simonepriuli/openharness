import type { ReactNode } from "react";
import { FileEditsSummary } from "../FileEditsSummary";
import { MarkdownContent } from "../MarkdownContent";
import { ReasoningBlock } from "../ReasoningBlock";
import { Thinking } from "../Thinking";
import { ToolActivity } from "../ToolActivity";
import { ToolExploreGroup, VISIBLE_EXPLORE_COUNT } from "../ToolExploreGroup";
import { ToolLine } from "../ToolLine";
import { UserMessageContent } from "../UserMessageContent";
import { AssistantMessageActions } from "./AssistantMessageActions";
import { collectAssistantTurnActions } from "./assistant-turn-actions";
import {
  shouldDeferSwarmWorkerRows,
  type ReasoningItem,
  type TimelineItem,
  type ToolActivityItem,
  type ToolLineItem,
} from "../../events";

export interface TimelineRowActionsOptions {
  onForkAssistantMessage?: (entryId: string) => void | Promise<void>;
  /** Disables fork when the conversation is not connected to Pi. */
  forkConnectionDisabled?: boolean;
}

export function renderTimelineRows(
  items: TimelineItem[],
  isStreaming: boolean,
  options: TimelineRowActionsOptions = {},
): ReactNode[] {
  const rows: ReactNode[] = [];
  let exploreBatch: ToolLineItem[] = [];
  let reasoningBatch: ReasoningItem[] = [];
  let fileEditBatch: ToolLineItem[] = [];
  let pendingSwarmActivity: ToolActivityItem | null = null;
  let turnAssistants: Array<{ id: string; content: string; entryId?: string }> = [];

  const flushTurnActions = (isActiveTurn: boolean) => {
    if (turnAssistants.length === 0) return;
    if (isActiveTurn && isStreaming) {
      turnAssistants = [];
      return;
    }
    const actions = collectAssistantTurnActions(turnAssistants);
    turnAssistants = [];
    if (!actions) return;
    rows.push(
      <div key={actions.key} className="assistant-turn-actions">
        <AssistantMessageActions
          content={actions.content}
          entryId={actions.entryId}
          forkDisabled={Boolean(options.forkConnectionDisabled)}
          onFork={options.onForkAssistantMessage}
        />
      </div>,
    );
  };

  const flushPendingSwarmActivity = () => {
    if (!pendingSwarmActivity) return;
    rows.push(
      <ToolActivity
        key={pendingSwarmActivity.id}
        activity={pendingSwarmActivity}
        isStreaming={isStreaming}
      />,
    );
    pendingSwarmActivity = null;
  };

  const flushFileEditBatch = () => {
    if (fileEditBatch.length === 0) return;

    if (isStreaming) {
      for (const line of fileEditBatch) {
        if (line.active) {
          rows.push(<ToolLine key={line.id} line={line} isStreaming={isStreaming} />);
        }
      }
    } else {
      const completed = fileEditBatch.filter((line) => !line.active);
      if (completed.length > 0) {
        rows.push(
          <FileEditsSummary key={`file-edits-${completed[0]!.id}`} lines={completed} />,
        );
      }
    }
    fileEditBatch = [];
  };

  const flushExploreBatch = () => {
    if (exploreBatch.length === 0) return;
    if (exploreBatch.length <= VISIBLE_EXPLORE_COUNT) {
      rows.push(
        <div className="tool-activity-group" key={`explore-${exploreBatch[0]!.id}`}>
          {exploreBatch.map((line) => (
            <ToolLine key={line.id} line={line} isStreaming={isStreaming} />
          ))}
        </div>,
      );
    } else {
      rows.push(
        <ToolExploreGroup
          key={`explore-${exploreBatch[0]!.id}`}
          lines={exploreBatch}
          isStreaming={isStreaming}
        />,
      );
    }
    exploreBatch = [];
  };

  const flushReasoningBatch = () => {
    for (const item of reasoningBatch) {
      rows.push(
        <ReasoningBlock key={item.id} item={item} isStreaming={isStreaming} />,
      );
    }
    reasoningBatch = [];
  };

  const flushTurnActivity = () => {
    flushExploreBatch();
    flushReasoningBatch();
  };

  for (const item of items) {
    if (item.kind === "user") {
      flushTurnActions(false);
      flushPendingSwarmActivity();
      flushFileEditBatch();
      flushTurnActivity();
      rows.push(<TimelineRow key={item.id} item={item} isStreaming={isStreaming} />);
      continue;
    }

    if (item.kind === "assistant") {
      turnAssistants.push({
        id: item.id,
        content: item.content,
        entryId: item.entryId,
      });
      flushTurnActivity();
      rows.push(<TimelineRow key={item.id} item={item} isStreaming={isStreaming} />);
      flushFileEditBatch();
      continue;
    }

    if (item.kind === "tool-line" && item.operation === "read") {
      exploreBatch.push(item);
      continue;
    }

    flushExploreBatch();

    if (item.kind === "tool-line" && (item.operation === "edit" || item.operation === "write")) {
      if (isStreaming && item.active) {
        rows.push(<ToolLine key={item.id} line={item} isStreaming={isStreaming} />);
      } else {
        fileEditBatch.push(item);
      }
      continue;
    }

    if (item.kind === "tool-line") {
      rows.push(<ToolLine key={item.id} line={item} isStreaming={isStreaming} />);
      continue;
    }
    if (item.kind === "tool-activity") {
      if (shouldDeferSwarmWorkerRows(item, isStreaming)) {
        pendingSwarmActivity = item;
        continue;
      }
      flushPendingSwarmActivity();
      rows.push(
        <ToolActivity key={item.id} activity={item} isStreaming={isStreaming} />,
      );
      continue;
    }
    if (item.kind === "reasoning") {
      reasoningBatch.push(item);
      continue;
    }
    rows.push(<TimelineRow key={item.id} item={item} isStreaming={isStreaming} />);
  }

  flushPendingSwarmActivity();
  flushFileEditBatch();
  flushTurnActivity();
  flushTurnActions(true);
  return rows;
}

function TimelineRow({
  item,
  isStreaming,
}: {
  item: TimelineItem;
  isStreaming: boolean;
}) {
  if (item.kind === "thinking") {
    return isStreaming ? <Thinking /> : null;
  }

  if (item.kind === "reasoning") {
    return <ReasoningBlock item={item} isStreaming={isStreaming} />;
  }

  if (item.kind === "tool-line") {
    return <ToolLine line={item} isStreaming={isStreaming} />;
  }

  if (item.kind === "tool-activity") {
    return <ToolActivity activity={item} isStreaming={isStreaming} />;
  }

  if (item.kind === "user") {
    return (
      <div className="message message-user">
        <div className="message-content">
          <UserMessageContent content={item.content} images={item.images} />
        </div>
      </div>
    );
  }

  return (
    <div className="message message-assistant">
      <div className="message-content">
        <MarkdownContent content={item.content} />
        {item.streaming && <span className="cursor">▋</span>}
      </div>
    </div>
  );
}
