import type { StoredAttachedRoot } from "../lib/chat-db";

interface AttachedRootChipsProps {
  roots: StoredAttachedRoot[];
  onRemove: (rootId: string) => void;
}

export function AttachedRootChips({ roots, onRemove }: AttachedRootChipsProps) {
  const folderRoots = roots.filter((root) => root.kind === "folder");
  if (folderRoots.length === 0) return null;

  return (
    <div className="attached-root-chips" aria-label="Attached folders">
      {folderRoots.map((root) => (
        <span key={root.id} className="attached-root-chip" title={root.absolutePath}>
          <span className="attached-root-chip-label">📁 {root.label}</span>
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
