import { useEffect, useRef } from "react";
import type { SettingsSection } from "../components/settings/SettingsNav";
import { applyTheme, storeTheme } from "../lib/theme";

type MenuActionHandlers = {
  onOpenSettings: (section?: SettingsSection) => void;
  onOpenFolder: () => void | Promise<void>;
  onNewConversation: (cwd: string) => void | Promise<void>;
  onToggleSidebar: () => void;
  onToggleSwarm: () => void | Promise<void>;
  getNewConversationCwd: () => string | null;
};

export function useHarnessMenuActions(handlers: MenuActionHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    return window.harness.onMenuAction((action) => {
      const h = handlersRef.current;
      switch (action.type) {
        case "open-settings":
          h.onOpenSettings(action.section);
          break;
        case "open-folder":
          void h.onOpenFolder();
          break;
        case "new-conversation": {
          const projectCwd = h.getNewConversationCwd();
          if (projectCwd) {
            void h.onNewConversation(projectCwd);
          } else {
            void h.onOpenFolder();
          }
          break;
        }
        case "toggle-sidebar":
          h.onToggleSidebar();
          break;
        case "toggle-swarm":
          void h.onToggleSwarm();
          break;
        case "set-theme":
          void window.harness.setSettings({ theme: action.theme }).then((settings) => {
            storeTheme(settings.theme);
            applyTheme(settings.theme);
          });
          break;
      }
    });
  }, []);
}
