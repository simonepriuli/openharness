import {
  ArrowDown01Icon,
  TokenCircleIcon,
  ComputerIcon,
  ContrastIcon,
  FolderOpenIcon,
  GaugeIcon,
  LinkSquare02Icon,
  Logout05Icon,
  Moon02Icon,
  Settings01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AppTheme,
  OpenRouterAccountCreditsResult,
  TokenUsageTotals,
} from "../../../../preload/api";
import { formatTokenCount } from "../../lib/format-tokens";
import { isMacUA } from "../main-workspace/constants";
import type { SettingsSection } from "../settings/SettingsNav";
import { iconPrimary, sidenavRowHover, textPrimary } from "../main-workspace/constants";
import { applyTheme, getStoredTheme, storeTheme } from "../../lib/theme";

const THEME_OPTIONS: { value: AppTheme; label: string; icon: typeof Sun03Icon }[] = [
  { value: "light", label: "Light", icon: Sun03Icon },
  { value: "dark", label: "Dark", icon: Moon02Icon },
  { value: "system", label: "System", icon: ComputerIcon },
];

const OPENROUTER_MANAGEMENT_KEYS_URL = "https://openrouter.ai/settings/management-keys";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/settings/credits";

const EMPTY_TOKEN_USAGE: TokenUsageTotals = {
  allTime: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  monthly: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  monthKey: "",
};

function formatCredits(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

type SidenavFooterProps = {
  creditsRefreshKey: number;
  tokensRefreshKey: number;
  onOpenFolder: () => void;
  onOpenSettings: (section?: SettingsSection) => void;
};

export function SidenavFooter({
  creditsRefreshKey,
  tokensRefreshKey,
  onOpenFolder,
  onOpenSettings,
}: SidenavFooterProps) {
  const [open, setOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [spendingExpanded, setSpendingExpanded] = useState(true);
  const [tokensExpanded, setTokensExpanded] = useState(true);
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme());
  const [creditsResult, setCreditsResult] = useState<OpenRouterAccountCreditsResult | null>(
    null,
  );
  const [tokenUsage, setTokenUsage] = useState<TokenUsageTotals>(EMPTY_TOKEN_USAGE);
  const rootRef = useRef<HTMLDivElement>(null);
  const spendingContentRef = useRef<HTMLDivElement>(null);
  const tokensContentRef = useRef<HTMLDivElement>(null);
  const [spendingBodyHeight, setSpendingBodyHeight] = useState(0);
  const [tokensBodyHeight, setTokensBodyHeight] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  const measureSpendingBody = useCallback(() => {
    const el = spendingContentRef.current;
    if (!el) return;
    setSpendingBodyHeight(el.scrollHeight);
  }, []);

  const measureTokensBody = useCallback(() => {
    const el = tokensContentRef.current;
    if (!el) return;
    setTokensBodyHeight(el.scrollHeight);
  }, []);

  useEffect(() => {
    if (!open) return;
    measureSpendingBody();
    const el = spendingContentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      measureSpendingBody();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, measureSpendingBody, creditsResult, spendingExpanded]);

  useEffect(() => {
    if (!open) return;
    measureTokensBody();
    const el = tokensContentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      measureTokensBody();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, measureTokensBody, tokenUsage, tokensExpanded]);

  useEffect(() => {
    if (!open) {
      setPanelEntered(false);
      return;
    }
    const frame = requestAnimationFrame(() => setPanelEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const loadPanelData = useCallback(async () => {
    const settings = await window.harness.getSettings();
    setTheme(settings.theme);
    setTokenUsage(settings.tokenUsage ?? EMPTY_TOKEN_USAGE);
    const stored =
      settings.openrouterAccountCredits ?? ({ status: "not_configured" } as const);
    setCreditsResult(stored);

    try {
      const fresh = await window.harness.refreshCredits();
      setCreditsResult(fresh);
    } catch {
      // Stale credits stay visible.
    }
  }, []);

  const refreshTokenUsage = useCallback(async () => {
    const settings = await window.harness.getSettings();
    setTokenUsage(settings.tokenUsage ?? EMPTY_TOKEN_USAGE);
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPanelData();
  }, [open, loadPanelData, creditsRefreshKey]);

  useEffect(() => {
    if (!open) return;
    void refreshTokenUsage();
  }, [open, refreshTokenUsage, tokensRefreshKey]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const openApiSettings = () => {
    close();
    onOpenSettings("cloud-providers");
  };

  const handleLogout = useCallback(async () => {
    close();
    if (typeof window.signOut !== "function") {
      return;
    }
    try {
      await window.signOut();
    } catch {
      // AuthGate listens for session updates via onUserUpdated.
    }
  }, [close]);

  const handleThemeChange = useCallback(async (next: AppTheme) => {
    const previous = getStoredTheme();
    setTheme(next);
    storeTheme(next);
    applyTheme(next);
    try {
      await window.harness.setSettings({ theme: next });
    } catch {
      setTheme(previous);
      storeTheme(previous);
      applyTheme(previous);
    }
  }, []);

  const renderSpendingBody = () => {
    if (creditsResult?.status === "ok") {
      return (
        <>
          <div className="workspace-panel-usage-stats">
            <div className="workspace-panel-usage-row">
              <span className="workspace-panel-usage-row-label">Remaining</span>
              <span className="workspace-panel-usage-row-value">
                {formatCredits(creditsResult.creditsRemaining)}
              </span>
            </div>
            <div className="workspace-panel-usage-row">
              <span className="workspace-panel-usage-row-label">Spent (all time)</span>
              <span className="workspace-panel-usage-row-value">
                {formatCredits(creditsResult.totalUsage)}
              </span>
            </div>
            {typeof creditsResult.monthlySpent === "number" ? (
              <div className="workspace-panel-usage-row">
                <span className="workspace-panel-usage-row-label">Spent (this month)</span>
                <span className="workspace-panel-usage-row-value">
                  {formatCredits(creditsResult.monthlySpent)}
                </span>
              </div>
            ) : null}
          </div>
          <a
            className="workspace-panel-item"
            href={OPENROUTER_CREDITS_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="workspace-panel-item-label">Add credits</span>
            <HugeiconsIcon
              icon={LinkSquare02Icon}
              size={14}
              strokeWidth={1.75}
              className="workspace-panel-item-hint"
              aria-hidden
            />
          </a>
        </>
      );
    }

    if (creditsResult?.status === "not_configured") {
      return (
        <>
          <p className="workspace-panel-usage-note">
            Add a management key to see credits and usage. Create one on OpenRouter, then add it in
            Settings.
          </p>
          <a
            className="workspace-panel-item"
            href={OPENROUTER_MANAGEMENT_KEYS_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span className="workspace-panel-item-label">Create key on openrouter.ai</span>
            <HugeiconsIcon
              icon={LinkSquare02Icon}
              size={14}
              strokeWidth={1.75}
              className="workspace-panel-item-hint"
              aria-hidden
            />
          </a>
          <button type="button" className="workspace-panel-item" onClick={openApiSettings}>
            <span className="workspace-panel-item-label">Set up in Settings</span>
          </button>
        </>
      );
    }

    if (creditsResult?.status === "invalid_key") {
      return (
        <>
          <p className="workspace-panel-usage-note">Management key is invalid or expired.</p>
          <button type="button" className="workspace-panel-item" onClick={openApiSettings}>
            <span className="workspace-panel-item-label">Update in Settings</span>
          </button>
        </>
      );
    }

    if (creditsResult?.status === "error") {
      return <p className="workspace-panel-usage-note">{creditsResult.message}</p>;
    }

    return null;
  };

  const renderTokensBody = () => (
    <div className="workspace-panel-usage-stats">
      <div className="workspace-panel-usage-row">
        <span className="workspace-panel-usage-row-label">Total tokens</span>
        <span className="workspace-panel-usage-row-value">
          {formatTokenCount(tokenUsage.allTime.total)}
        </span>
      </div>
      <div className="workspace-panel-usage-row">
        <span className="workspace-panel-usage-row-label">Tokens (this month)</span>
        <span className="workspace-panel-usage-row-value">
          {formatTokenCount(tokenUsage.monthly.total)}
        </span>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="app-region-no-drag sidenav-footer relative shrink-0 bg-transparent px-1.5 pb-2 pt-1"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex h-8 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium ${textPrimary} ${sidenavRowHover}`}
        onClick={() => setOpen((v) => !v)}
      >
        <HugeiconsIcon
          icon={Settings01Icon}
          size={16}
          strokeWidth={1.5}
          className={`shrink-0 ${iconPrimary}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">Workspace</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Workspace"
          className={`workspace-panel-shell ${panelEntered ? "is-open" : "is-closed"} absolute bottom-full left-1.5 right-1.5 z-30 mb-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-popover)] shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.45)]`}
        >
          <div className="workspace-panel">
            <div className="workspace-panel-menu">
              <button
                type="button"
                className="workspace-panel-item"
                onClick={() => {
                  close();
                  onOpenFolder();
                }}
              >
                <HugeiconsIcon icon={FolderOpenIcon} size={15} strokeWidth={1.75} aria-hidden />
                <span className="workspace-panel-item-label">Open folder…</span>
                <kbd className="workspace-panel-kbd">{isMacUA ? "⌘O" : "Ctrl+O"}</kbd>
              </button>
              <button
                type="button"
                className="workspace-panel-item"
                onClick={() => {
                  close();
                  onOpenSettings();
                }}
              >
                <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.75} aria-hidden />
                <span className="workspace-panel-item-label">Settings</span>
                <kbd className="workspace-panel-kbd">{isMacUA ? "⌘," : "Ctrl+,"}</kbd>
              </button>
            </div>

            <div className="workspace-panel-usage">
              <button
                type="button"
                className="workspace-panel-usage-header"
                aria-expanded={spendingExpanded}
                onClick={() => setSpendingExpanded((v) => !v)}
              >
                <HugeiconsIcon icon={GaugeIcon} size={15} strokeWidth={1.75} aria-hidden />
                <span className="workspace-panel-usage-header-label">Spending</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={14}
                  strokeWidth={1.75}
                  className={`workspace-panel-usage-header-chevron${spendingExpanded ? " is-expanded" : ""}`}
                  aria-hidden
                />
              </button>
              <div
                className="workspace-panel-usage-collapse"
                style={{ height: spendingExpanded ? spendingBodyHeight : 0 }}
              >
                <div ref={spendingContentRef} className="workspace-panel-usage-content">
                  {renderSpendingBody()}
                </div>
              </div>
            </div>

            <div className="workspace-panel-usage workspace-panel-usage-section">
              <button
                type="button"
                className="workspace-panel-usage-header"
                aria-expanded={tokensExpanded}
                onClick={() => setTokensExpanded((v) => !v)}
              >
                <HugeiconsIcon icon={TokenCircleIcon} size={15} strokeWidth={1.75} aria-hidden />
                <span className="workspace-panel-usage-header-label">Usage</span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  size={14}
                  strokeWidth={1.75}
                  className={`workspace-panel-usage-header-chevron${tokensExpanded ? " is-expanded" : ""}`}
                  aria-hidden
                />
              </button>
              <div
                className="workspace-panel-usage-collapse"
                style={{ height: tokensExpanded ? tokensBodyHeight : 0 }}
              >
                <div ref={tokensContentRef} className="workspace-panel-usage-content">
                  {renderTokensBody()}
                </div>
              </div>
            </div>

            <div className="workspace-panel-theme">
              <span className="workspace-panel-theme-label">
                <HugeiconsIcon icon={ContrastIcon} size={15} strokeWidth={1.75} aria-hidden />
                Theme
              </span>
              <div
                className="workspace-panel-theme-options"
                role="radiogroup"
                aria-label="Theme"
              >
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={theme === option.value}
                    aria-label={option.label}
                    title={option.label}
                    className={`workspace-panel-theme-button${theme === option.value ? " is-active" : ""}`}
                    onClick={() => void handleThemeChange(option.value)}
                  >
                    <HugeiconsIcon icon={option.icon} size={15} strokeWidth={1.75} aria-hidden />
                  </button>
                ))}
              </div>
            </div>

            {typeof window.signOut === "function" ? (
              <div className="workspace-panel-menu workspace-panel-usage-section">
                <button type="button" className="workspace-panel-item" onClick={() => void handleLogout()}>
                  <HugeiconsIcon icon={Logout05Icon} size={15} strokeWidth={1.75} aria-hidden />
                  <span className="workspace-panel-item-label">Log out</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
