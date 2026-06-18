import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import type { AppTheme, HarnessSettings } from "../../../../preload/api";
import {
  electronMacVibrancy,
  isMacUA,
  macTitlebarContentOffsetClass,
  sidenavBorder,
  sidenavRowHover,
  sidenavSurface,
  titlebarRowClass,
} from "../main-workspace/constants";
import { MacTitlebarGutter } from "../main-workspace/MacTitlebarGutter";
import { ChatSettings } from "./ChatSettings";
import { CloudProvidersSettingsView } from "./CloudProvidersSettingsView";
import { GeneralSettings } from "./GeneralSettings";
import { LocalProvidersSettingsView } from "./LocalProvidersSettingsView";
import { applyTheme, storeTheme } from "../../lib/theme";
import { SettingsNav, type SettingsSection } from "./SettingsNav";
import { SwarmSettings } from "./SwarmSettings";
import { WebSearchSettingsView } from "./WebSearchSettingsView";

type SettingsViewProps = {
  onClose: () => void;
  onSettingsChanged?: () => void;
  activeSessionKey?: string | null;
  initialSection?: SettingsSection;
};

export function SettingsView({
  onClose,
  onSettingsChanged,
  activeSessionKey = null,
  initialSection = "general",
}: SettingsViewProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
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
      const previousTheme = settings?.theme;
      if (patch.theme) {
        storeTheme(patch.theme);
        applyTheme(patch.theme);
      }
      try {
        const next = await window.harness.setSettings(patch);
        storeTheme(next.theme);
        applyTheme(next.theme);
        setSettings(next);
        onSettingsChanged?.();
      } catch (err) {
        if (patch.theme && previousTheme) {
          storeTheme(previousTheme);
          applyTheme(previousTheme);
        }
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [onSettingsChanged, settings?.theme],
  );

  const handleThemeChange = useCallback(
    async (theme: AppTheme) => {
      await applySettings({ theme });
    },
    [applySettings],
  );

  return (
    <div
      className={`settings-root flex h-screen min-h-0 flex-col text-slate-900 dark:text-neutral-200 ${
        electronMacVibrancy ? "bg-transparent" : "bg-slate-50 dark:bg-[#151515]"
      }`}
    >
      <div className="settings-layout flex min-h-0 flex-1">
        <aside
          className={`flex w-[280px] shrink-0 flex-col border-r ${sidenavBorder} ${
            electronMacVibrancy ? "sidebar-translucent" : sidenavSurface
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
                  className={`mb-2 flex h-10 w-full min-w-0 items-center gap-2 rounded-md pl-3 pr-2 text-left text-sm font-medium text-slate-700 transition-colors dark:text-neutral-300 ${sidenavRowHover}`}
                  onClick={onClose}
                >
                  <HugeiconsIcon
                    icon={ArrowLeft01Icon}
                    size={14}
                    strokeWidth={1.5}
                    className="shrink-0 text-slate-500 dark:text-slate-400"
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
                  onThemeChange={handleThemeChange}
                />
              ) : section === "chat" ? (
                <ChatSettings
                  settings={settings}
                  saving={saving}
                  sessionKey={activeSessionKey}
                  onSaveChatVisibleModels={(chatVisibleModels) =>
                    applySettings({ chatVisibleModels })
                  }
                  onSaveTitleGenerationModel={(titleGenerationModel) =>
                    applySettings({ titleGenerationModel })
                  }
                />
              ) : section === "swarm" ? (
                <SwarmSettings
                  settings={settings}
                  saving={saving}
                  sessionKey={activeSessionKey}
                  onSaveSwarmDefaultModel={(swarmDefaultModel) =>
                    applySettings({ swarmDefaultModel })
                  }
                />
              ) : section === "cloud-providers" ? (
                <CloudProvidersSettingsView
                  settings={settings}
                  saving={saving}
                  onSettingsChanged={() => {
                    void reload();
                    onSettingsChanged?.();
                  }}
                  onSaveManagementKey={(openrouterManagementKey) =>
                    applySettings({ openrouterManagementKey })
                  }
                  onRemoveManagementKey={() =>
                    applySettings({ clearOpenRouterManagementKey: true })
                  }
                />
              ) : section === "local-providers" ? (
                <LocalProvidersSettingsView
                  saving={saving}
                  onSettingsChanged={() => {
                    void reload();
                    onSettingsChanged?.();
                  }}
                />
              ) : section === "web-search" ? (
                <WebSearchSettingsView
                  settings={settings}
                  saving={saving}
                  onSaveExaKey={(exaApiKey) => applySettings({ exaApiKey })}
                  onRemoveExaKey={() => applySettings({ clearExaApiKey: true })}
                />
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
