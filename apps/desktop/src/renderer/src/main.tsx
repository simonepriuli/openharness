import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  applyTheme,
  getStoredTheme,
  hydrateThemeFromSettings,
  subscribeToSystemTheme,
} from "./lib/theme";
import "./index.css";
import "./styles.css";

applyTheme(getStoredTheme());
subscribeToSystemTheme();
void hydrateThemeFromSettings();

if (typeof window !== "undefined" && window.harness.nativeVibrancyEnabled) {
  document.documentElement.classList.add("electron-mac-vibrancy");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
