import { useEffect, useId, type ReactNode } from "react";

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** When false, backdrop clicks do not close the modal. Default true. */
  closeOnBackdrop?: boolean;
  /** When false, Escape does not close the modal. Default true. */
  closeOnEscape?: boolean;
};

export function SettingsModal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: SettingsModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeOnEscape, onClose, open]);

  if (!open) return null;

  return (
    <div
      className="workflow-modal-overlay app-region-no-drag"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="workflow-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId} className="workflow-modal-title">
          {title}
        </h3>
        {subtitle ? <p className="workflow-modal-subtitle">{subtitle}</p> : null}
        {children}
        {footer ? <div className="workflow-modal-actions">{footer}</div> : null}
      </div>
    </div>
  );
}
