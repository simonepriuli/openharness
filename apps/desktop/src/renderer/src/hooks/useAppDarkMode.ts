import { useEffect, useState } from "react";

function readAppDarkMode(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

/** Tracks the resolved app appearance (`html.dark`), including explicit theme settings. */
export function useAppDarkMode(): boolean {
  const [isDark, setIsDark] = useState(readAppDarkMode);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}
