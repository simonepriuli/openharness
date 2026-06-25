import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { XlsxViewer } from "@extend-ai/react-xlsx";
import { useCallback, useEffect, useState } from "react";
import "@renderer/lib/xlsx-wasm";

type WorkModeXlsxPanelProps = {
  cwd: string | null;
  activePath?: string;
  refreshKey?: number;
  onManualRefresh: () => void;
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function workbookFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

function workbookErrorMessage(error: string): string {
  switch (error) {
    case "too_large":
      return "This workbook is larger than 25 MB and cannot be previewed in OpenHarness.";
    case "outside_project":
      return "Workbook path is outside the workspace.";
    case "not_xlsx":
      return "Only .xlsx files can be previewed here.";
    case "directory":
      return "The selected path is a directory, not a workbook.";
    case "not_found":
      return "Workbook not found.";
    default:
      return "Failed to load workbook.";
  }
}

export function WorkModeXlsxPanel({
  cwd,
  activePath,
  refreshKey = 0,
  onManualRefresh,
}: WorkModeXlsxPanelProps) {
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWorkbook = useCallback(async () => {
    if (!cwd || !activePath) {
      setFileBuffer(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await window.harness.readWorkbookFile({ cwd, relativePath: activePath });
      if (!result.ok) {
        setFileBuffer(null);
        setError(workbookErrorMessage(result.error));
        return;
      }
      setFileBuffer(base64ToArrayBuffer(result.base64));
    } catch {
      setFileBuffer(null);
      setError("Failed to load workbook.");
    } finally {
      setLoading(false);
    }
  }, [activePath, cwd]);

  useEffect(() => {
    void loadWorkbook();
  }, [loadWorkbook, refreshKey]);

  useEffect(() => {
    if (!cwd || !activePath) {
      void window.harness.unwatchWorkbookFile();
      return;
    }
    void window.harness.watchWorkbookFile({ cwd, relativePath: activePath });
    return () => {
      void window.harness.unwatchWorkbookFile();
    };
  }, [activePath, cwd]);

  if (!cwd) {
    return <div className="project-explorer-placeholder">Open a work project to preview spreadsheets.</div>;
  }

  return (
    <div className="work-mode-xlsx-panel">
      {activePath ? (
        <div className="work-mode-xlsx-toolbar">
          <button
            type="button"
            className="work-mode-xlsx-icon-button"
            aria-label="Refresh workbook preview"
            title="Refresh"
            disabled={loading}
            onClick={() => {
              onManualRefresh();
              void loadWorkbook();
            }}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} />
          </button>
          <span className="work-mode-xlsx-filename" title={activePath}>
            {workbookFileName(activePath)}
          </span>
        </div>
      ) : null}

      <div className="work-mode-xlsx-viewer">
        {!activePath ? (
          <div className="project-explorer-placeholder work-mode-xlsx-empty">
            <p>No spreadsheets open yet.</p>
            <p>
              <strong>Open a file in composer</strong> — ask the agent to read or edit a spreadsheet.
            </p>
          </div>
        ) : loading ? (
          <div className="project-explorer-placeholder">Loading workbook…</div>
        ) : error ? (
          <div className="project-explorer-placeholder">{error}</div>
        ) : fileBuffer ? (
          <XlsxViewer
            className="work-mode-xlsx-viewer-inner"
            file={fileBuffer}
            fileName={workbookFileName(activePath)}
            height="100%"
            readOnly
            rounded={false}
            showDefaultToolbar={false}
            emptyState={
              <div className="project-explorer-placeholder">No workbook data to display.</div>
            }
          />
        ) : (
          <div className="project-explorer-placeholder">No workbook data to display.</div>
        )}
      </div>
    </div>
  );
}
