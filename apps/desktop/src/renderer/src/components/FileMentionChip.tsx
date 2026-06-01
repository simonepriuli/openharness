import { getFileBaseName, getFileIconMeta } from "../lib/composer-draft";

interface FileMentionChipProps {
  relativePath: string;
}

export function FileMentionChip({ relativePath }: FileMentionChipProps) {
  const icon = getFileIconMeta(relativePath);
  const name = getFileBaseName(relativePath);

  return (
    <span className="file-mention-chip" contentEditable={false}>
      <span
        className="file-mention-chip-icon"
        style={{ backgroundColor: icon.color, color: icon.textColor ?? "#ffffff" }}
        aria-hidden
      >
        {icon.label}
      </span>
      <span className="file-mention-chip-label">{name}</span>
    </span>
  );
}
