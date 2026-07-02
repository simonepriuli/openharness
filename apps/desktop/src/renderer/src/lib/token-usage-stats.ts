export type HeatmapCell = {
  date: string;
  tokens: number;
  level: number;
};

export type HeatmapGrid = {
  weeks: HeatmapCell[][];
  startDate: string;
  endDate: string;
};

const HEATMAP_WEEKS = 53;

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function computeIntensityLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function buildHeatmapGrid(
  daily: Record<string, number>,
  endDate: Date = new Date(),
): HeatmapGrid {
  const end = startOfDay(endDate);
  const endWeekStart = new Date(end);
  endWeekStart.setDate(end.getDate() - end.getDay());

  const startWeekStart = new Date(endWeekStart);
  startWeekStart.setDate(startWeekStart.getDate() - (HEATMAP_WEEKS - 1) * 7);

  const weeks: HeatmapCell[][] = [];

  for (let weekIndex = 0; weekIndex < HEATMAP_WEEKS; weekIndex += 1) {
    const weekStart = new Date(startWeekStart);
    weekStart.setDate(weekStart.getDate() + weekIndex * 7);

    const column: HeatmapCell[] = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const cellDate = new Date(weekStart);
      cellDate.setDate(cellDate.getDate() + dayOffset);
      const isFuture = cellDate > end;
      const tokens = isFuture ? 0 : (daily[localDateKey(cellDate)] ?? 0);
      column.push({
        date: localDateKey(cellDate),
        tokens,
        level: 0,
      });
    }
    weeks.push(column);
  }

  const max = Math.max(...weeks.flat().map((cell) => cell.tokens), 1);
  for (const week of weeks) {
    for (const cell of week) {
      cell.level = computeIntensityLevel(cell.tokens, max);
    }
  }

  return {
    weeks,
    startDate: localDateKey(startWeekStart),
    endDate: localDateKey(end),
  };
}

export function formatHeatmapDateRange(startDate: string, endDate: string): string {
  const parse = (key: string) => {
    const [year, month, day] = key.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };
  const start = parse(startDate);
  const end = parse(endDate);
  if (!start || !end) return "Past 12 months";

  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function computeMostActiveMonth(daily: Record<string, number>): string | null {
  const monthTotals = new Map<string, number>();
  for (const [dateKey, tokens] of Object.entries(daily)) {
    if (tokens <= 0) continue;
    const monthKey = dateKey.slice(0, 7);
    monthTotals.set(monthKey, (monthTotals.get(monthKey) ?? 0) + tokens);
  }
  if (monthTotals.size === 0) return null;

  let bestMonthKey: string | null = null;
  let bestTotal = 0;
  for (const [monthKey, total] of monthTotals) {
    if (total > bestTotal) {
      bestTotal = total;
      bestMonthKey = monthKey;
    }
  }
  if (!bestMonthKey) return null;

  const [year, month] = bestMonthKey.split("-").map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" });
}

export function computeMostActiveDay(daily: Record<string, number>): string | null {
  let bestDate: string | null = null;
  let bestTotal = 0;
  for (const [dateKey, tokens] of Object.entries(daily)) {
    if (tokens > bestTotal) {
      bestTotal = tokens;
      bestDate = dateKey;
    }
  }
  if (!bestDate) return null;

  const [year, month, day] = bestDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function sortedActiveDateKeys(daily: Record<string, number>): string[] {
  return Object.entries(daily)
    .filter(([, tokens]) => tokens > 0)
    .map(([dateKey]) => dateKey)
    .sort();
}

export function computeLongestStreak(daily: Record<string, number>): number {
  const activeDates = sortedActiveDateKeys(daily);
  if (activeDates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let index = 1; index < activeDates.length; index += 1) {
    const previous = new Date(activeDates[index - 1]!);
    const currentDate = new Date(activeDates[index]!);
    const diffDays = Math.round(
      (currentDate.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}

export function computeCurrentStreak(
  daily: Record<string, number>,
  endDate: Date = new Date(),
): number {
  const todayKey = localDateKey(startOfDay(endDate));
  if ((daily[todayKey] ?? 0) <= 0) return 0;

  let streak = 0;
  const cursor = startOfDay(endDate);
  while (true) {
    const key = localDateKey(cursor);
    if ((daily[key] ?? 0) <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function formatStreakDays(days: number): string {
  return `${days}d`;
}

export function hasUsageHistory(daily: Record<string, number>): boolean {
  return Object.values(daily).some((tokens) => tokens > 0);
}
