import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import type { HarnessSettings } from "../../../../preload/api";
import {
  electronMacVibrancy,
  isMacUA,
  macTitlebarContentOffsetClass,
  titlebarRowClass,
} from "../main-workspace/constants";
import { MacTitlebarGutter } from "../main-workspace/MacTitlebarGutter";
import { ApiSettings } from "./ApiSettings";
import { GeneralSettings } from "./GeneralSettings";
import { SettingsNav, type SettingsSection } from "./SettingsNav";

type SettingsViewProps = {
  onClose: () => void;
  onSettingsChanged?: () => void;
};

export function SettingsView({ onClose, onSettingsChanged }: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [settings, setSettings] = useState<HarnessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMac = isMacUA && typeof window.harness !== "undefined";

  const reload = useCallback(async () => {
    const next = await window.harness.getSettings();
    setSettings(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await reload();
        if (!cancelled) setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const applySettings = useCallback(
    async (patch: Parameters<typeof window.harness.setSettings>[0]) => {
      setSaving(true);
      try {
        const next = await window.harness.setSettings(patch);
        setSettings(next);
        onSettingsChanged?.();
      } finally {
        setSaving(false);
      }
    },
    [onSettingsChanged],
  );

  return (
    <div
      className={`settings-root flex h-screen min-h-0 flex-col text-slate-900 ${
        electronMacVibrancy ? "bg-transparent" : "bg-slate-50"
      }`}
    >
      <div className="settings-layout flex min-h-0 flex-1">
        <aside
          className={`flex w-[280px] shrink-0 flex-col border-r border-slate-200/90 ${
            electronMacVibrancy
              ? "sidebar-translucent"
              : "bg-white/55 backdrop-blur-xl backdrop-saturate-150"
          }`}
        >
          <div className="flex min-h-0 w-[280px] flex-1 flex-col">
            <div className={titlebarRowClass(isMac)}>
              <MacTitlebarGutter isMac={isMac} variant="sidebar" />
              <div
                className={`flex min-w-0 flex-1 items-center pr-3 ${isMac ? "pl-0" : "px-3"} ${
                  isMac ? macTitlebarContentOffsetClass : ""
                }`}
              />
            </div>

            <div className="app-region-no-drag scroll-viewport flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
              <nav className="space-y-0.5" aria-label="Settings">
                <button
                  type="button"
                  className="mb-2 flex h-10 w-full min-w-0 items-center gap-2 rounded-md pl-3 pr-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-900/10"
                  onClick={onClose}
                >
                  <HugeiconsIcon
                    icon={ArrowLeft01Icon}
                    size={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-slate-500"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">Back to app</span>
                </button>
                <SettingsNav active={section} onSelect={setSection} />
              </nav>
            </div>
          </div>
        </aside>

        <main className="settings-main app-region-no-drag">
          {loading ? (
            <p className="settings-muted">Loading settings…</p>
          ) : loadError ? (
            <p className="settings-error">{loadError}</p>
          ) : settings ? (
            <>
              {section === "general" ? (
                <GeneralSettings
                  settings={settings}
                  saving={saving}
                  onUseGlobalPiConfigChange={(value) =>
                    applySettings({ useGlobalPiConfig: value })
                  }
                />
              ) : (
                <ApiSettings
                  settings={settings}
                  saving={saving}
                  onSaveOpenRouterKey={(openrouterApiKey) =>
                    applySettings({ openrouterApiKey })
                  }
                  onRemoveOpenRouterKey={() =>
                    applySettings({ clearOpenRouterApiKey: true })
                  }
                />
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
