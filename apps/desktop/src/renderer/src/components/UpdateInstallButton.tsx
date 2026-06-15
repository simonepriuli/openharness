import { LoaderPinwheelIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useAppUpdate } from "../hooks/useAppUpdate";

type UpdateInstallButtonProps = {
  className?: string;
};

export function UpdateInstallButton({ className = "" }: UpdateInstallButtonProps) {
  const { status, version, install } = useAppUpdate();
  const [installing, setInstalling] = useState(false);

  if (status !== "downloaded") {
    return null;
  }

  const title = version ? `Install update v${version}` : "Install update";
  const busyTitle = version ? `Installing update v${version}…` : "Installing update…";

  return (
    <button
      type="button"
      className={`inline-grid h-7 shrink-0 grid-cols-1 grid-rows-1 items-center justify-center rounded-lg px-2.5 text-xs font-medium leading-none transition-colors disabled:pointer-events-none disabled:opacity-70 bg-slate-900 text-white hover:bg-slate-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 ${className}`}
      disabled={installing}
      aria-busy={installing}
      onClick={() => {
        setInstalling(true);
        install();
      }}
      title={installing ? busyTitle : title}
    >
      <span className={`col-start-1 row-start-1 ${installing ? "invisible" : ""}`}>Update</span>
      {installing ? (
        <span className="col-start-1 row-start-1 flex items-center justify-center">
          <HugeiconsIcon
            icon={LoaderPinwheelIcon}
            size={14}
            strokeWidth={1.7}
            className="animate-spin"
            aria-hidden
          />
        </span>
      ) : null}
    </button>
  );
}
