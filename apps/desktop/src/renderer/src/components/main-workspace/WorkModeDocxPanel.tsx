import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { buildDocModel, parseDocx, ReactDocxViewer, type DocModel } from "@extend-ai/react-docx";
import { useCallback, useEffect, useState } from "react";
import { ensureDocxWasmReady } from "@renderer/lib/docx-wasm";

type WorkModeDocxPanelProps = {
  cwd: string | null;
  sessionKey?: string | null;
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

function documentFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? relativePath;
}

function documentErrorMessage(error: string): string {
  switch (error) {
    case "too_large":
      return "This document is larger than 25 MB and cannot be previewed in OpenHarness.";
    case "outside_project":
      return "Document path is outside the workspace.";
    case "not_office_file":
      return "Only .docx files can be previewed here.";
    case "directory":
      return "The selected path is a directory, not a document.";
    case "not_found":
      return "Document not found.";
    default:
      return "Failed to load document.";
  }
}

export function WorkModeDocxPanel({
  cwd,
  sessionKey,
  activePath,
  refreshKey = 0,
  onManualRefresh,
}: WorkModeDocxPanelProps) {
  const [model, setModel] = useState<DocModel | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    if (!cwd || !activePath) {
      setModel(undefined);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setModel(undefined);
    try {
      const result = await window.harness.readOfficeFile({
        cwd,
        relativePath: activePath,
        sessionKey: sessionKey ?? undefined,
      });
      if (!result.ok) {
        setError(documentErrorMessage(result.error));
        return;
      }
      const buffer = base64ToArrayBuffer(result.base64);
      await ensureDocxWasmReady();
      const pkg = await parseDocx(buffer);
      setModel(await buildDocModel(pkg));
    } catch (err) {
      setModel(undefined);
      setError(err instanceof Error ? err.message : "Failed to load document.");
    } finally {
      setLoading(false);
    }
  }, [activePath, cwd, sessionKey]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument, refreshKey]);

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
      void loadDocument();
    });
    return unsubscribe;
  }, [activePath, cwd, loadDocument]);

  if (!cwd) {
    return <div className="project-explorer-placeholder">Open a work project to preview documents.</div>;
  }

  return (
    <div className="work-mode-docx-panel work-mode-xlsx-panel">
      {activePath ? (
        <div className="work-mode-xlsx-toolbar">
          <button
            type="button"
            className="work-mode-xlsx-icon-button"
            aria-label="Refresh document preview"
            title="Refresh"
            disabled={loading}
            onClick={() => {
              onManualRefresh();
              void loadDocument();
            }}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={16} />
          </button>
          <span className="work-mode-xlsx-filename" title={activePath}>
            {documentFileName(activePath)}
          </span>
        </div>
      ) : null}

      <div className="work-mode-xlsx-viewer work-mode-docx-viewer">
        {!activePath ? (
          <div className="project-explorer-placeholder work-mode-xlsx-empty">
            <p>
              <strong>Open a file in composer</strong> — ask the agent to read or edit a document.
            </p>
          </div>
        ) : loading ? (
          <div className="project-explorer-placeholder">Loading document…</div>
        ) : error ? (
          <div className="project-explorer-placeholder">{error}</div>
        ) : model ? (
          <ReactDocxViewer
            className="work-mode-docx-viewer-inner"
            model={model}
            emptyState={
              <div className="project-explorer-placeholder">No document data to display.</div>
            }
          />
        ) : (
          <div className="project-explorer-placeholder">No document data to display.</div>
        )}
      </div>
    </div>
  );
}
