import { useRef } from "react";
import {
  filterUserMessagesFromTimeline,
  prepareTimelineForDisplay,
  type TimelineState,
} from "../../events";
import { useThreadScroll } from "../../hooks/useThreadScroll";
import { renderTimelineRows } from "../timeline/TimelineRows";
import { Shimmer } from "../Shimmer";

type WorkflowRunTranscriptPanelProps = {
  runId: string;
  timeline: TimelineState;
  isStreaming: boolean;
  isRunActive: boolean;
};

export function WorkflowRunTranscriptPanel({
  runId,
  timeline,
  isStreaming,
  isRunActive,
}: WorkflowRunTranscriptPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeRunIdRef = useRef(runId);
  activeRunIdRef.current = runId;

  const showLiveUi = isStreaming && isRunActive;

  const displayItems = prepareTimelineForDisplay(
    filterUserMessagesFromTimeline(timeline.items),
    showLiveUi,
  );

  const { chatScrollRef, handleChatScroll } = useThreadScroll({
    activeConversationId: runId,
    activeConversationIdRef: activeRunIdRef,
    timelineItems: displayItems,
    isStreaming: showLiveUi,
    messagesEndRef,
  });

  const showSetupActivity = isRunActive && displayItems.length === 0;

  return (
    <div className="workflow-run-transcript-panel">
      <div
        ref={chatScrollRef}
        className="workflow-run-transcript-scroll scroll-viewport"
        onScroll={handleChatScroll}
      >
        <div className="workflow-run-transcript-content">
          <div className="messages-flow">
            {showSetupActivity ? (
              <div className="tool-activity" aria-busy="true" aria-live="polite">
                <Shimmer as="span" className="tool-activity-text">
                  Setting up the environment…
                </Shimmer>
              </div>
            ) : null}
            {renderTimelineRows(displayItems, showLiveUi)}
            <div ref={messagesEndRef} className="messages-scroll-anchor" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
