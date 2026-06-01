import { parseMessageParts } from "../lib/file-mention";
import { FileMentionChip } from "./FileMentionChip";

interface UserMessageContentProps {
  content: string;
}

export function UserMessageContent({ content }: UserMessageContentProps) {
  const parts = parseMessageParts(content);
  const hasMentions = parts.some((part) => part.type === "mention");

  if (!hasMentions) {
    return <>{content}</>;
  }

  return (
    <span className="user-message-parts">
      {parts.map((part, index) =>
        part.type === "mention" ? (
          <FileMentionChip key={`${part.relativePath}-${index}`} relativePath={part.relativePath} />
        ) : (
          <span key={`text-${index}`} className="user-message-text">
            {part.value}
          </span>
        ),
      )}
    </span>
  );
}
