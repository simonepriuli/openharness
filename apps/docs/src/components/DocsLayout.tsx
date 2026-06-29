import { useCallback, useState } from "react";
import { Outlet } from "react-router-dom";
import { DocsHeader } from "./DocsHeader";
import { DocsSidebar } from "./DocsSidebar";
import { DocsToc } from "./DocsToc";
import { SearchDialog, useSearchShortcut } from "./SearchDialog";

export function DocsLayout(): React.JSX.Element {
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  useSearchShortcut(openSearch);

  return (
    <div className="flex min-h-full flex-col">
      <DocsHeader
        onSearchOpen={openSearch}
        onSidebarToggle={() => setSidebarOpen((open) => !open)}
        sidebarOpen={sidebarOpen}
      />

      <div className="flex flex-1">
        <DocsSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex min-w-0 flex-1 justify-center px-4 lg:px-8">
          <div className="flex w-full max-w-6xl gap-8">
            <main className="min-w-0 flex-1 max-w-3xl">
              <Outlet />
            </main>
            <DocsToc />
          </div>
        </div>
      </div>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
