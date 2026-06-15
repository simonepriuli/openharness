import { parseMessageParts } from "../lib/file-mention";
import { FileMentionChip } from "./FileMentionChip";

interface UserMessageImage {
  mimeType: string;
  data: string;
}

interface UserMessageContentProps {
  content: string;
  images?: UserMessageImage[];
}

function UserMessageImages({ images }: { images: UserMessageImage[] }) {
  if (images.length === 0) return null;

  return (
    <div className="user-message-images">
      {images.map((image, index) => (
        <img
          key={`${image.mimeType}-${index}`}
          className="user-message-image"
          src={`data:${image.mimeType};base64,${image.data}`}
          alt=""
        />
      ))}
    </div>
  );
}

export function UserMessageContent({ content, images }: UserMessageContentProps) {
  const parts = parseMessageParts(content);
  const hasMentions = parts.some((part) => part.type === "mention");
  const hasImages = Boolean(images?.length);
  const hasText = content.trim().length > 0;

  if (!hasMentions && !hasImages) {
    return <>{content}</>;
  }

  if (!hasMentions) {
    return (
      <>
        {hasText ? <span className="user-message-text">{content}</span> : null}
        {hasImages ? <UserMessageImages images={images!} /> : null}
      </>
    );
  }

  return (
    <>
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
      {hasImages ? <UserMessageImages images={images!} /> : null}
    </>
  );
}
