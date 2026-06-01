import { memo, useMemo, type CSSProperties, type ElementType } from "react";

export interface ShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

/**
 * Text shimmer effect (adapted from AI Elements:
 * https://elements.ai-sdk.dev/components/shimmer)
 */
function ShimmerComponent({
  children,
  as: Component = "span",
  className = "",
  duration = 2,
  spread = 2,
}: ShimmerProps) {
  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);

  const style: CSSProperties = {
    ["--shimmer-spread" as string]: `${dynamicSpread}px`,
    animationDuration: `${duration}s`,
  };

  return (
    <Component className={`shimmer ${className}`.trim()} style={style}>
      {children}
    </Component>
  );
}

export const Shimmer = memo(ShimmerComponent);
