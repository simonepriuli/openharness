export function formatThreadCost(amount: number): string {
  const abs = Math.abs(amount);
  const fractionDigits = abs > 0 && abs < 1 ? 3 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
