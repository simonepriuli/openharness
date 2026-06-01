import { macTitlebarGutterClass, macTitlebarGutterSidebarClass } from "./constants";

type MacTitlebarGutterProps = {
  isMac: boolean;
  /** Sidenav open uses a narrower gutter so the close button sits nearer the traffic lights. */
  variant?: "main" | "sidebar";
};

export function MacTitlebarGutter({ isMac, variant = "main" }: MacTitlebarGutterProps) {
  if (!isMac) return null;
  const className = variant === "sidebar" ? macTitlebarGutterSidebarClass : macTitlebarGutterClass;
  return <div className={className} aria-hidden />;
}
