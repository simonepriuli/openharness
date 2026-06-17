const TIERS = [
  { value: 1_000_000_000_000, suffix: "T" },
  { value: 1_000_000_000, suffix: "B" },
  { value: 1_000_000, suffix: "M" },
  { value: 1_000, suffix: "k" },
] as const;

function formatScaled(value: number, divisor: number, suffix: string): string {
  const scaled = value / divisor;
  if (scaled >= 100) {
    return `${Math.round(scaled)}${suffix}`;
  }
  const rounded = Math.round(scaled * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}${suffix}`;
}

/** Compact display for large token counts (e.g. 14.9k, 2.1M). */
export function formatTokenCount(count: number): string {
  const n = Number(count);
  if (!Number.isFinite(n)) return "0";

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs < 1000) {
    return sign + String(abs);
  }

  for (const tier of TIERS) {
    if (abs >= tier.value) {
      return sign + formatScaled(abs, tier.value, tier.suffix);
    }
  }

  return sign + String(abs);
}

/** Full locale-formatted count for detailed views (e.g. composer tooltips). */
export function formatTokenCountExact(count: number): string {
  return Number(count).toLocaleString("en-US");
}
