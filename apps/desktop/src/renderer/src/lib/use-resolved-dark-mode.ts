import { useEffect, useState } from "react";
import { subscribeToSystemTheme } from "./theme";

export function readResolvedDarkMode(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function useResolvedDarkMode(): boolean {
  const [isDark, setIsDark] = useState(readResolvedDarkMode);

  useEffect(() => {
    const sync = () => setIsDark(readResolvedDarkMode());

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const unsubscribeSystemTheme = subscribeToSystemTheme(sync);

    return () => {
      observer.disconnect();
      unsubscribeSystemTheme();
    };
  }, []);

  return isDark;
}
