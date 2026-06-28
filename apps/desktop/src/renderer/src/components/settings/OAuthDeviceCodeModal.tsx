import { useEffect, useState } from "react";
import type { OAuthDeviceCodePayload } from "../../../../preload/api";

type OAuthDeviceCodeModalProps = {
  open: boolean;
  deviceCode: OAuthDeviceCodePayload | null;
  progressMessage: string | null;
  onCancel: () => void;
};

export function OAuthDeviceCodeModal({
  open,
  deviceCode,
  progressMessage,
  onCancel,
}: OAuthDeviceCodeModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleCopyCode = async () => {
    if (!deviceCode?.userCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.userCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleOpenBrowser = () => {
    if (!deviceCode?.verificationUri) return;
    void window.harness.openExternal({ url: deviceCode.verificationUri });
  };

  return (
    <div
      className="workflow-modal-overlay app-region-no-drag"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className="workflow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oauth-device-code-title"
      >
        <h3 id="oauth-device-code-title" className="workflow-modal-title">
          Connect ChatGPT
        </h3>
        <p className="workflow-modal-subtitle">
          Open the verification page, sign in with your ChatGPT Plus or Pro account, and enter
          the code below.
        </p>

        {deviceCode ? (
          <>
            <label className="settings-muted settings-oauth-code-label" htmlFor="oauth-device-code">
              Your code
            </label>
            <input
              id="oauth-device-code"
              readOnly
              className="settings-api-input settings-oauth-code-input"
              value={deviceCode.userCode}
            />
            <p className="settings-muted settings-oauth-url">{deviceCode.verificationUri}</p>
            <div className="settings-api-actions settings-oauth-modal-actions">
              <button
                type="button"
                className="settings-button settings-button-ghost"
                onClick={() => void handleCopyCode()}
              >
                {copied ? "Copied" : "Copy code"}
              </button>
              <button
                type="button"
                className="settings-button settings-button-save"
                onClick={handleOpenBrowser}
              >
                Open in browser
              </button>
            </div>
          </>
        ) : (
          <p className="settings-muted workflow-modal-feedback">Preparing authorization…</p>
        )}

        {progressMessage ? (
          <p className="settings-muted workflow-modal-feedback" role="status">
            {progressMessage}
          </p>
        ) : null}

        <div className="workflow-modal-actions">
          <button
            type="button"
            className="settings-button settings-button-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
