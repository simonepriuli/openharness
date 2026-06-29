import { NavLink } from "react-router-dom";
import { docsNavigation } from "../lib/docs-nav";
import { resolveNavHref } from "../lib/content";

type DocsSidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function DocsSidebar({ open, onClose }: DocsSidebarProps): React.JSX.Element {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={onClose}
          aria-label="Close navigation overlay"
        />
      ) : null}

      <aside
        className={`docs-scroll fixed bottom-0 left-0 top-14 z-30 w-64 overflow-y-auto border-r border-gray-200 bg-gray-50/80 px-4 py-6 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="space-y-6">
          {docsNavigation.navigation.map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const href = resolveNavHref(item.path);
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={href}
                        end={href === "/"}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-accent-muted font-medium text-accent"
                              : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                          }`
                        }
                      >
                        {item.title}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
