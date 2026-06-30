import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { XlsxViewer, XlsxViewerProvider } from "@extend-ai/react-xlsx";
import { useCallback, useEffect, useState } from "react";
import { WorkbookSheetTabBar } from "./WorkbookSheetTabBar";
import "@renderer/lib/xlsx-wasm";

type WorkModeXlsxPanelProps = {
  cwd: string | null;
  sessionKey?: string | null;
  activePath?: string;
  activeSheetName?: string;
  refreshKey?: number;
  onManualRefresh: () => void;
  onActiveSheetChange: (sheetName: string) => void;
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
    case "not_office_file":
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
  sessionKey,
  activePath,
  activeSheetName,
  refreshKey = 0,
  onManualRefresh,
  onActiveSheetChange,
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
      const result = await window.harness.readOfficeFile({
        cwd,
        relativePath: activePath,
        sessionKey: sessionKey ?? undefined,
      });
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
  }, [activePath, cwd, sessionKey]);

  useEffect(() => {
    void loadWorkbook();
  }, [loadWorkbook, refreshKey]);

  useEffect(() => {
    if (!cwd || !activePath) {
      void window.harness.unwatchOfficeFile();
      return;
    }
    void window.harness.watchOfficeFile({
      cwd,
      relativePath: activePath,
      sessionKey: sessionKey ?? undefined,
    });
    return () => {
      void window.harness.unwatchOfficeFile();
    };
  }, [activePath, cwd, sessionKey]);

  useEffect(() => {
    if (!cwd || !activePath) return;
    const unsubscribe = window.harness.onOfficeFileChanged((payload) => {
      if (payload.cwd !== cwd || payload.relativePath !== activePath) return;
      void loadWorkbook();
    });
    return unsubscribe;
  }, [activePath, cwd, loadWorkbook]);

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
            <p>
              <strong>Open a file in composer</strong> — ask the agent to read or edit a document.
            </p>
          </div>
        ) : loading ? (
          <div className="project-explorer-placeholder">Loading workbook…</div>
        ) : error ? (
          <div className="project-explorer-placeholder">{error}</div>
        ) : fileBuffer ? (
          <XlsxViewerProvider
            file={fileBuffer}
            fileName={workbookFileName(activePath)}
            readOnly
          >
            <div className="work-mode-xlsx-viewer-stack">
              <XlsxViewer
                className="work-mode-xlsx-viewer-inner"
                height="100%"
                readOnly
                rounded={false}
                showDefaultToolbar={false}
                emptyState={
                  <div className="project-explorer-placeholder">No workbook data to display.</div>
                }
              />
              <WorkbookSheetTabBar
                activeSheetName={activeSheetName}
                onActiveSheetChange={onActiveSheetChange}
              />
            </div>
          </XlsxViewerProvider>
        ) : (
          <div className="project-explorer-placeholder">No workbook data to display.</div>
        )}
      </div>
    </div>
  );
}
