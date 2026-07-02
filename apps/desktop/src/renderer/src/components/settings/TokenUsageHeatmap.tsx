import { useCallback, useMemo, useRef, useState } from "react";
import { formatTokenCountExact } from "../../lib/format-tokens";
import {
  buildHeatmapGrid,
  formatHeatmapDateRange,
  type HeatmapCell,
} from "../../lib/token-usage-stats";

type TokenUsageHeatmapProps = {
  daily: Record<string, number>;
};

type TooltipState = {
  cell: HeatmapCell;
  x: number;
  y: number;
};

function formatCellDate(cell: HeatmapCell): string {
  const [year, month, day] = cell.date.split("-").map(Number);
  if (!year || !month || !day) return cell.date;
  return new Date(year, month - 1, day).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TokenUsageHeatmap({ daily }: TokenUsageHeatmapProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { weeks, startDate, endDate } = useMemo(() => buildHeatmapGrid(daily), [daily]);
  const dateRange = useMemo(
    () => formatHeatmapDateRange(startDate, endDate),
    [startDate, endDate],
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const showTooltip = useCallback((cell: HeatmapCell, target: HTMLElement) => {
    const panel = panelRef.current;
    if (!panel) return;

    const cellRect = target.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    setTooltip({
      cell,
      x: cellRect.left - panelRect.left + cellRect.width / 2,
      y: cellRect.top - panelRect.top,
    });
  }, []);

  const clearTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <div className="usage-heatmap-wrap">
      <p className="usage-heatmap-caption">
        <span className="usage-heatmap-date-range">{dateRange}</span>
        <span className="usage-heatmap-hint">
          Each square is one day. Hover for the date and token count.
        </span>
      </p>

      <div
        ref={panelRef}
        className="usage-heatmap-panel"
        role="group"
        aria-label={`Token usage from ${dateRange}`}
        onMouseLeave={clearTooltip}
      >
        <div className="usage-heatmap-grid">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="usage-heatmap-week">
              {week.map((cell) => (
                <button
                  key={cell.date}
                  type="button"
                  className={`usage-heatmap-cell usage-heatmap-cell-level-${cell.level}`}
                  aria-label={`${formatCellDate(cell)}, ${formatTokenCountExact(cell.tokens)} tokens`}
                  onMouseEnter={(event) => showTooltip(cell, event.currentTarget)}
                  onFocus={(event) => showTooltip(cell, event.currentTarget)}
                  onBlur={clearTooltip}
                />
              ))}
            </div>
          ))}
        </div>

        {tooltip ? (
          <div
            className="usage-heatmap-tooltip"
            style={{ left: tooltip.x, top: tooltip.y }}
            role="tooltip"
          >
            <span className="usage-heatmap-tooltip-date">{formatCellDate(tooltip.cell)}</span>
            <span className="usage-heatmap-tooltip-tokens">
              {formatTokenCountExact(tooltip.cell.tokens)} tokens
            </span>
          </div>
        ) : null}
      </div>

      <div className="usage-heatmap-legend" aria-hidden>
        <span className="usage-heatmap-legend-label">Less</span>
        <span className="usage-heatmap-cell usage-heatmap-cell-level-0" />
        <span className="usage-heatmap-cell usage-heatmap-cell-level-1" />
        <span className="usage-heatmap-cell usage-heatmap-cell-level-2" />
        <span className="usage-heatmap-cell usage-heatmap-cell-level-3" />
        <span className="usage-heatmap-cell usage-heatmap-cell-level-4" />
        <span className="usage-heatmap-legend-label">More</span>
      </div>
    </div>
  );
}
