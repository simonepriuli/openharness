import type { ComponentProps } from "react";
import { cn } from "@renderer/lib/utils";

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-0.5 rounded-sm border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 font-sans text-[11px] font-medium leading-none text-[var(--text-soft)]",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
