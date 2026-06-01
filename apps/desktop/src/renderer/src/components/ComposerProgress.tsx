interface ComposerProgressProps {
  percentUsed: number | null;
  tokens: number | null;
  contextWindow: number;
}

function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

export function ComposerProgress({ percentUsed, tokens, contextWindow }: ComposerProgressProps) {
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillPercent = percentUsed ?? 0;
  const offset = circumference * (1 - Math.min(100, Math.max(0, fillPercent)) / 100);
  const label = percentUsed === null ? "?" : `${Math.round(percentUsed)}%`;
  const remainingPercent =
    percentUsed === null ? null : Math.max(0, Math.round(100 - percentUsed));
  const title =
    percentUsed === null || tokens === null
      ? `Context window: unknown / ${formatTokenCount(contextWindow)}`
      : `Context: ${formatTokenCount(tokens)} / ${formatTokenCount(contextWindow)} (${remainingPercent}% remaining)`;

  return (
    <div
      className="composer-progress"
      role="status"
      aria-live="polite"
      aria-label={title}
      title={title}
    >
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
