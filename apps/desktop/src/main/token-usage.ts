import type { SessionStats, TokenStats } from "../preload/api.js";
import { appStore } from "./store.js";

export interface TokenUsageTotals {
  allTime: TokenStats;
  monthly: TokenStats;
  monthKey: string;
}

type StoredTokenUsage = {
  monthKey: string;
  allTime: TokenStats;
  monthly: TokenStats;
  sessionSnapshots: Record<string, TokenStats>;
};

const EMPTY_STATS: TokenStats = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  total: 0,
};

function currentMonthKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function emptyStored(): StoredTokenUsage {
  return {
    monthKey: currentMonthKey(),
    allTime: { ...EMPTY_STATS },
    monthly: { ...EMPTY_STATS },
    sessionSnapshots: {},
  };
}

function tokenStatsFromSession(tokens: SessionStats["tokens"]): TokenStats {
  return {
    input: tokens.input,
    output: tokens.output,
    cacheRead: tokens.cacheRead,
    cacheWrite: tokens.cacheWrite,
    total: tokens.total,
  };
}

function computeDelta(previous: TokenStats, current: TokenStats): TokenStats {
  return {
    input: Math.max(0, current.input - previous.input),
    output: Math.max(0, current.output - previous.output),
    cacheRead: Math.max(0, current.cacheRead - previous.cacheRead),
    cacheWrite: Math.max(0, current.cacheWrite - previous.cacheWrite),
    total: Math.max(0, current.total - previous.total),
  };
}

function addStats(base: TokenStats, delta: TokenStats): TokenStats {
  return {
    input: base.input + delta.input,
    output: base.output + delta.output,
    cacheRead: base.cacheRead + delta.cacheRead,
    cacheWrite: base.cacheWrite + delta.cacheWrite,
    total: base.total + delta.total,
  };
}

function hasDelta(delta: TokenStats): boolean {
  return (
    delta.input > 0 ||
    delta.output > 0 ||
    delta.cacheRead > 0 ||
    delta.cacheWrite > 0 ||
    delta.total > 0
  );
}

function statsEqual(a: TokenStats, b: TokenStats): boolean {
  return (
    a.input === b.input &&
    a.output === b.output &&
    a.cacheRead === b.cacheRead &&
    a.cacheWrite === b.cacheWrite &&
    a.total === b.total
  );
}

export function getStoredTokenUsage(): TokenUsageTotals {
  const stored = appStore.get("tokenUsage");
  if (!stored) {
    return {
      allTime: { ...EMPTY_STATS },
      monthly: { ...EMPTY_STATS },
      monthKey: currentMonthKey(),
    };
  }
  return {
    allTime: { ...stored.allTime },
    monthly: { ...stored.monthly },
    monthKey: stored.monthKey,
  };
}

export function recordSessionTokenUsage(stats: SessionStats): void {
  const sessionId = stats.sessionId;
  if (!sessionId) return;

  const current = tokenStatsFromSession(stats.tokens);
  let stored = appStore.get("tokenUsage") ?? emptyStored();

  const monthKey = currentMonthKey();
  if (stored.monthKey !== monthKey) {
    stored = {
      ...stored,
      monthKey,
      monthly: { ...EMPTY_STATS },
    };
  }

  const previous = stored.sessionSnapshots[sessionId] ?? { ...EMPTY_STATS };
  if (statsEqual(previous, current)) return;

  const delta = computeDelta(previous, current);
  stored = {
    ...stored,
    allTime: hasDelta(delta) ? addStats(stored.allTime, delta) : stored.allTime,
    monthly: hasDelta(delta) ? addStats(stored.monthly, delta) : stored.monthly,
    sessionSnapshots: {
      ...stored.sessionSnapshots,
      [sessionId]: current,
    },
  };

  appStore.set("tokenUsage", stored);
}
