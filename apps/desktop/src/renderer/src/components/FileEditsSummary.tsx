import type { ToolLineItem } from "../events";
import { consolidateFileEditLines } from "../lib/tool-activity-summary";

function DiffStats({ added, removed }: { added: number; removed: number }) {
  if (added === 0 && removed === 0) return null;
  return (
    <span className="file-edits-diff">
      {added > 0 ? <span className="tool-activity-diff-added">+{added}</span> : null}
      {added > 0 && removed > 0 ? " " : null}
      {removed > 0 ? <span className="tool-activity-diff-removed">-{removed}</span> : null}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      className="file-edits-chevron"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 4.5 10 8 6 11.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function headerLabel(count: number, allCreates: boolean): string {
  const verb = allCreates ? "Created" : "Edited";
  const noun = count === 1 ? "file" : "files";
  return `${verb} ${count} ${noun}`;
}

export function FileEditsSummary({ lines }: { lines: ToolLineItem[] }) {
  const edits = consolidateFileEditLines(lines);
  if (edits.length === 0) return null;

  const totalAdded = edits.reduce((sum, edit) => sum + edit.linesAdded, 0);
  const totalRemoved = edits.reduce((sum, edit) => sum + edit.linesRemoved, 0);
  const allCreates = edits.every((edit) => edit.isCreate);

  return (
    <details className="file-edits-summary">
      <summary className="file-edits-summary-toggle">
        <Chevron />
        <span className="file-edits-summary-label">
          {headerLabel(edits.length, allCreates)}
        </span>
        <DiffStats added={totalAdded} removed={totalRemoved} />
      </summary>
      <ul className="file-edits-summary-list">
        {edits.map((edit) => (
          <li key={edit.path} className="file-edits-summary-row">
            <span className="file-edits-summary-path" title={edit.path}>
              {edit.path}
            </span>
            <DiffStats added={edit.linesAdded} removed={edit.linesRemoved} />
          </li>
        ))}
      </ul>
    </details>
  );
}
