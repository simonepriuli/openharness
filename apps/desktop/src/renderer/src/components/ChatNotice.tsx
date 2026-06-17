import { ApiIcon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { HarnessErrorDisplay } from "../../../shared/harness-errors";
import { iconPrimary } from "./main-workspace/constants";

type ChatNoticeProps = {
  error: HarnessErrorDisplay;
  onOpenSettings?: () => void;
  onDismiss?: () => void;
};

export function ChatNotice({ error, onOpenSettings, onDismiss }: ChatNoticeProps) {
  const isSetup = error.code === "missing_api_key";
  const showSettings = isSetup && onOpenSettings;

  return (
    <div
      className={`chat-notice${isSetup ? " chat-notice-setup" : " chat-notice-error"}`}
      role="alert"
    >
      <div className="chat-notice-icon" aria-hidden>
        <HugeiconsIcon
          icon={isSetup ? ApiIcon : AlertCircleIcon}
          size={18}
          strokeWidth={1.6}
          className={iconPrimary}
        />
      </div>
      <div className="chat-notice-content">
        <p className="chat-notice-title">{error.title}</p>
        <p className="chat-notice-description">{error.description}</p>
        {(showSettings || (!isSetup && onDismiss)) && (
          <div className="chat-notice-actions">
            {showSettings ? (
              <button type="button" className="chat-notice-link" onClick={onOpenSettings}>
                Open Settings
              </button>
            ) : null}
          </div>
        )}
      </div>
      {!isSetup && onDismiss ? (
        <button
          type="button"
          className="chat-notice-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
