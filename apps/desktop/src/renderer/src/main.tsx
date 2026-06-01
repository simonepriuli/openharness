import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import "./styles.css";

if (typeof window !== "undefined" && window.harness.nativeVibrancyEnabled) {
  document.documentElement.classList.add("electron-mac-vibrancy");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
