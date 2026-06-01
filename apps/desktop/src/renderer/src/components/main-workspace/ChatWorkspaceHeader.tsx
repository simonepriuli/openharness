import { macTitlebarContentOffsetClass, titlebarRowClass } from "./constants";
import { MacTitlebarGutter } from "./MacTitlebarGutter";
import { SidebarToggleButton } from "../SidebarToggleButton";

type ChatWorkspaceHeaderProps = {
  title: string;
  isMac: boolean;
  showSidebarToggle: boolean;
  onToggleSidebar: () => void;
};

/**
 * Main-panel titlebar. When the sidenav is collapsed, matches azrev
 * `MainWorkspaceNoPrSelected`: gutter for traffic lights, then `ml-14` is not
 * needed because the gutter already clears them — toggle sits after the gutter.
 */
export function ChatWorkspaceHeader({
  title,
  isMac,
  showSidebarToggle,
  onToggleSidebar,
}: ChatWorkspaceHeaderProps) {
  return (
    <div className={`${titlebarRowClass(isMac)} border-b border-slate-200`}>
      {showSidebarToggle ? (
        <>
          <MacTitlebarGutter isMac={isMac} />
          <SidebarToggleButton
            expanded={false}
            className={`mr-2 shrink-0 transition-opacity duration-200 opacity-100 ${
              isMac ? macTitlebarContentOffsetClass : ""
            }`}
            onClick={onToggleSidebar}
          />
        </>
      ) : null}

      <h2
        className={`app-region-no-drag m-0 min-w-0 flex-1 truncate px-5 text-base font-medium leading-none text-slate-900 ${
          isMac ? macTitlebarContentOffsetClass : ""
        }`}
      >
        {title}
      </h2>
    </div>
  );
}
