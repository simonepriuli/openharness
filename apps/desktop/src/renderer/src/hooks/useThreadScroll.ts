import { useCallback, useEffect, useRef, type RefObject } from "react";

const NEAR_BOTTOM_THRESHOLD_PX = 80;

type ThreadScrollState = {
  scrollTop: number;
  stickToBottom: boolean;
};

function isNearBottom(el: HTMLElement, threshold = NEAR_BOTTOM_THRESHOLD_PX): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

export function useThreadScroll(options: {
  activeConversationId: string | null;
  activeConversationIdRef: RefObject<string | null>;
  timelineItems: unknown[];
  isStreaming: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}) {
  const {
    activeConversationId,
    activeConversationIdRef,
    timelineItems,
    isStreaming,
    messagesEndRef,
  } = options;

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const threadScrollStateRef = useRef(new Map<string, ThreadScrollState>());
  const trackedConversationIdRef = useRef<string | null>(null);

  const persistScrollState = useCallback((conversationId: string | null) => {
    const el = chatScrollRef.current;
    if (!conversationId || !el) return;
    threadScrollStateRef.current.set(conversationId, {
      scrollTop: el.scrollTop,
      stickToBottom: isNearBottom(el),
    });
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    },
    [messagesEndRef],
  );

  const stickActiveToBottom = useCallback(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    threadScrollStateRef.current.set(conversationId, {
      scrollTop: chatScrollRef.current?.scrollTop ?? 0,
      stickToBottom: true,
    });
    scrollToBottom("smooth");
  }, [activeConversationIdRef, scrollToBottom]);

  const handleChatScroll = useCallback(() => {
    persistScrollState(activeConversationIdRef.current);
  }, [activeConversationIdRef, persistScrollState]);

  useEffect(() => {
    const previousConversationId = trackedConversationIdRef.current;
    if (previousConversationId === activeConversationId) return;

    if (previousConversationId) {
      persistScrollState(previousConversationId);
    }

    trackedConversationIdRef.current = activeConversationId;

    const el = chatScrollRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      if (!activeConversationId) {
        el.scrollTop = 0;
        return;
      }

      const saved = threadScrollStateRef.current.get(activeConversationId);
      if (saved) {
        el.scrollTop = saved.scrollTop;
        return;
      }

      scrollToBottom("instant");
      threadScrollStateRef.current.set(activeConversationId, {
        scrollTop: el.scrollTop,
        stickToBottom: true,
      });
    });
  }, [activeConversationId, persistScrollState, scrollToBottom]);

  useEffect(() => {
    const conversationId = activeConversationId;
    if (!conversationId) return;

    const saved = threadScrollStateRef.current.get(conversationId);
    if (saved && !saved.stickToBottom) return;

    scrollToBottom(isStreaming ? "instant" : "smooth");
  }, [timelineItems, activeConversationId, isStreaming, scrollToBottom]);

  return {
    chatScrollRef,
    handleChatScroll,
    stickActiveToBottom,
  };
}
