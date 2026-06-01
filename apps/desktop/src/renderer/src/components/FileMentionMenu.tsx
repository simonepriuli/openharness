import { useEffect, useRef } from "react";

export interface ProjectFile {
  relativePath: string;
}

interface FileMentionMenuProps {
  files: ProjectFile[];
  selectedIndex: number;
  loading: boolean;
  onSelect: (file: ProjectFile) => void;
}

export function FileMentionMenu({
  files,
  selectedIndex,
  loading,
  onSelect,
}: FileMentionMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(
      `[data-mention-index="${selectedIndex}"]`,
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, files]);

  return (
    <div className="file-mention-menu" role="listbox">
      {loading && files.length === 0 && (
        <div className="file-mention-empty">Searching files…</div>
      )}
      {!loading && files.length === 0 && (
        <div className="file-mention-empty">No matching files</div>
      )}
      <ul ref={listRef} className="file-mention-list">
        {files.map((file, index) => (
          <li key={file.relativePath}>
            <button
              type="button"
              role="option"
              data-mention-index={index}
              aria-selected={index === selectedIndex}
              className={`file-mention-item${index === selectedIndex ? " file-mention-item-selected" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(file);
              }}
            >
              <span className="file-mention-icon" aria-hidden>
                📄
              </span>
              <span className="file-mention-path">{file.relativePath}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
