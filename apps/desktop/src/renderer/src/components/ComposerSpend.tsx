import { useEffect, useMemo, useRef } from "react";
import { SlotText } from "slot-text/react";
import { formatThreadCost } from "../lib/format-cost";

interface ComposerSpendProps {
  cost: number;
}

export function ComposerSpend({ cost }: ComposerSpendProps) {
  const prevCostRef = useRef(cost);
  const label = formatThreadCost(cost);
  const direction = cost >= prevCostRef.current ? "up" : "down";
  const spendOptions = useMemo(
    () => ({
      direction,
      skipUnchanged: true,
    }),
    [direction],
  );

  useEffect(() => {
    prevCostRef.current = cost;
  }, [cost]);

  return (
    <div
      className="composer-spend"
      role="status"
      aria-live="polite"
      aria-label={`Thread spend: ${label}`}
    >
      <div className="composer-spend-tooltip">
        <div className="composer-spend-tooltip-title">Thread spend (estimated)</div>
        <p className="composer-spend-tooltip-copy">
          Total estimated cost for this conversation, including turns removed by compaction.
          Based on catalog model pricing, not your actual invoice.
        </p>
      </div>
      <SlotText text={label} options={spendOptions} className="composer-spend-label" />
    </div>
  );
}
