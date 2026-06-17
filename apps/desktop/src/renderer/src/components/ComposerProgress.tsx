import type { TokenStats } from "../../../preload/api";
import { formatTokenCountExact } from "../lib/format-tokens";

interface ComposerProgressProps {
  percentUsed: number | null;
  tokens: number | null;
  contextWindow: number;
  tokenStats?: TokenStats;
}


function TooltipRow({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`composer-progress-tooltip-row${highlighted ? " composer-progress-tooltip-row-highlight" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ComposerProgress({
  percentUsed,
  tokens,
  contextWindow,
  tokenStats,
}: ComposerProgressProps) {
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillPercent = percentUsed ?? 0;
  const offset = circumference * (1 - Math.min(100, Math.max(0, fillPercent)) / 100);
  const label = percentUsed === null ? "?" : `${Math.round(percentUsed)}%`;

  const contextSummary =
    percentUsed === null || tokens === null
      ? `Context window: unknown / ${formatTokenCountExact(contextWindow)}`
      : `Context: ${formatTokenCountExact(tokens)} / ${formatTokenCountExact(contextWindow)} (${Math.round(percentUsed)}%)`;

  return (
    <div
      className="composer-progress"
      role="status"
      aria-live="polite"
      aria-label={contextSummary}
    >
      <div className="composer-progress-tooltip">
        <div className="composer-progress-tooltip-title">Context usage</div>
        <TooltipRow
          label="Context used"
          value={
            percentUsed === null || tokens === null
              ? "unknown"
              : `${formatTokenCountExact(tokens)} / ${formatTokenCountExact(contextWindow)} (${Math.round(percentUsed)}%)`
          }
        />
        {tokenStats && (
          <>
            <div className="composer-progress-tooltip-divider" />
            <TooltipRow label="Input tokens" value={formatTokenCountExact(tokenStats.input)} />
            <TooltipRow label="Output tokens" value={formatTokenCountExact(tokenStats.output)} />
            <TooltipRow label="Cache read" value={formatTokenCountExact(tokenStats.cacheRead)} />
            <TooltipRow label="Cache write" value={formatTokenCountExact(tokenStats.cacheWrite)} />
            <TooltipRow
              label="Total tokens"
              value={formatTokenCountExact(tokenStats.total)}
              highlighted
            />
          </>
        )}
      </div>
      <svg
        className="composer-progress-ring"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          className="composer-progress-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className={`composer-progress-fill${percentUsed === null ? " composer-progress-fill-unknown" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="composer-progress-label">{label}</span>
    </div>
  );
}
