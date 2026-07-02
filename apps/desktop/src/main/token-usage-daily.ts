export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function pruneDailyOlderThan(
  daily: Record<string, number>,
  months: number,
  now: Date = new Date(),
): Record<string, number> {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setHours(0, 0, 0, 0);
  const cutoffKey = localDateKey(cutoff);
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(daily)) {
    if (key >= cutoffKey) {
      result[key] = value;
    }
  }
  return result;
}

export function addDailyTokens(
  daily: Record<string, number>,
  dateKey: string,
  deltaTotal: number,
): Record<string, number> {
  if (deltaTotal <= 0) return daily;
  return {
    ...daily,
    [dateKey]: (daily[dateKey] ?? 0) + deltaTotal,
  };
}
