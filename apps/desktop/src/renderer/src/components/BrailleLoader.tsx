import { useEffect, useState } from "react";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FRAME_MS = 80;

interface BrailleLoaderProps {
  className?: string;
  /** When true, parent provides the accessible status (e.g. sidenav row `aria-busy`). */
  decorative?: boolean;
}

export function BrailleLoader({ className = "", decorative = false }: BrailleLoaderProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % SPINNER_FRAMES.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span
      className={`braille-loader ${className}`.trim()}
      aria-hidden={decorative}
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : "Generating response"}
    >
      {SPINNER_FRAMES[frame]}
    </span>
  );
}
