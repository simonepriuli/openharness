import { ArchiveXIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { sidenavRowActive, sidenavRowHover } from "../main-workspace/constants";
import type { ConversationSummary } from "../../../../preload/api";
import { BrailleLoader } from "../BrailleLoader";
import { formatRelativeCompact } from "../../lib/formatRelativeCompact";

type ConversationListRowProps = {
  conversation: ConversationSummary;
  selected: boolean;
  streaming: boolean;
  onSelect: () => void;
  onArchive: () => void;
};

function ConversationListRowInner({
  conversation,
  selected,
  streaming,
  onSelect,
  onArchive,
}: ConversationListRowProps) {
  const rel = formatRelativeCompact(conversation.updatedAt);

  return (
    <li className="group">
      <div
        className={`flex h-10 w-full min-w-0 items-center rounded-md transition-colors ${sidenavRowHover} ${
          selected ? sidenavRowActive : ""
        }`}
      >
        <button
          type="button"
          aria-busy={streaming}
          className={`app-region-no-drag flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-3 pr-1 text-left text-xs transition-colors ${
            selected ? "text-slate-900 dark:text-neutral-100" : "text-slate-700 dark:text-neutral-300"
          }`}
          onClick={onSelect}
        >
          <span
            className="flex w-6 shrink-0 items-center justify-center text-slate-500 dark:text-white"
            aria-hidden={!streaming}
          >
            {streaming ? <BrailleLoader className="sidenav-braille" decorative /> : null}
          </span>
          <span className="sidenav-conversation-title-wrap">
            <span className="sidenav-conversation-title-fade font-medium">
              {conversation.title}
            </span>
          </span>
        </button>
        <div className="hidden shrink-0 items-center gap-1.5 pr-1 group-hover:flex">
          {rel ? (
            <span
              className="shrink-0 tabular-nums text-[10px] text-slate-400 dark:text-white"
              title={conversation.updatedAt}
            >
              {rel}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Archive conversation"
            className={`app-region-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-700 dark:text-white dark:hover:text-white/80 ${sidenavRowHover}`}
            onClick={(event) => {
              event.stopPropagation();
              onArchive();
            }}
          >
            <HugeiconsIcon icon={ArchiveXIcon} size={15} strokeWidth={1.6} aria-hidden />
          </button>
        </div>
      </div>
    </li>
  );
}

export const ConversationListRow = memo(ConversationListRowInner);
