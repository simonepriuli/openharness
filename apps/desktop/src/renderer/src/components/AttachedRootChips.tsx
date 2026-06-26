import type { StoredAttachedRoot } from "../lib/chat-db";

interface AttachedRootChipsProps {
  roots: StoredAttachedRoot[];
  onRemove: (rootId: string) => void;
}

export function AttachedRootChips({ roots, onRemove }: AttachedRootChipsProps) {
  if (roots.length === 0) return null;

  return (
    <div className="attached-root-chips" aria-label="Attached files and folders">
      {roots.map((root) => (
        <span key={root.id} className="attached-root-chip" title={root.absolutePath}>
          <span className="attached-root-chip-label">
            {root.kind === "folder" ? "📁" : "📄"} {root.label}
          </span>
          <button
            type="button"
            className="attached-root-chip-remove"
            aria-label={`Remove ${root.label}`}
            onClick={() => onRemove(root.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
