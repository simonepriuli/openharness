import { useCallback, useEffect, useState } from "react";
import type { TokenUsageTotals } from "../../../../preload/api";
import { formatTokenCount } from "../../lib/format-tokens";
import {
  computeCurrentStreak,
  computeLongestStreak,
  computeMostActiveDay,
  computeMostActiveMonth,
  formatStreakDays,
  hasUsageHistory,
} from "../../lib/token-usage-stats";
import { SettingsCard } from "./SettingsCard";
import { TokenUsageHeatmap } from "./TokenUsageHeatmap";

const EMPTY_TOKEN_USAGE: TokenUsageTotals = {
  allTime: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  monthly: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  monthKey: "",
  daily: {},
};

type UsageStatProps = {
  label: string;
  value: string;
};

function UsageStat({ label, value }: UsageStatProps) {
  return (
    <div className="usage-stat">
      <span className="usage-stat-label">{label}</span>
      <span className="usage-stat-value">{value}</span>
    </div>
  );
}

export function UsageSettingsView() {
  const [tokenUsage, setTokenUsage] = useState<TokenUsageTotals>(EMPTY_TOKEN_USAGE);
  const [loading, setLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    const settings = await window.harness.getSettings();
    setTokenUsage(settings.tokenUsage ?? EMPTY_TOKEN_USAGE);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const daily = tokenUsage.daily ?? {};
  const showHistoryNote = !hasUsageHistory(daily);

  const mostActiveMonth = computeMostActiveMonth(daily) ?? "—";
  const mostActiveDay = computeMostActiveDay(daily) ?? "—";
  const longestStreak = formatStreakDays(computeLongestStreak(daily));
  const currentStreak = formatStreakDays(computeCurrentStreak(daily));

  return (
    <div className="settings-panel">
      <h2 className="settings-panel-title">Usage</h2>
      <p className="settings-muted settings-section-lead">
        Track your token consumption over time.
      </p>

      {loading ? (
        <p className="settings-muted">Loading usage…</p>
      ) : (
        <>
          <SettingsCard>
            <div className="usage-headline">
              <div className="usage-headline-block">
                <span className="usage-headline-label">Total tokens</span>
                <span className="usage-headline-value">
                  {formatTokenCount(tokenUsage.allTime.total)}
                </span>
              </div>
              <div className="usage-headline-block usage-headline-block-secondary">
                <span className="usage-headline-label">Tokens this month</span>
                <span className="usage-headline-value-secondary">
                  {formatTokenCount(tokenUsage.monthly.total)}
                </span>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title="Activity" overflowVisible>
            <TokenUsageHeatmap daily={daily} />
            {showHistoryNote ? (
              <p className="settings-muted usage-history-note">
                Usage history starts today — check back as you use the agent.
              </p>
            ) : null}
          </SettingsCard>

          <div className="usage-stats-footer">
            <UsageStat label="Most active month" value={mostActiveMonth} />
            <UsageStat label="Most active day" value={mostActiveDay} />
            <UsageStat label="Longest streak" value={longestStreak} />
            <UsageStat label="Current streak" value={currentStreak} />
          </div>
        </>
      )}
    </div>
  );
}
