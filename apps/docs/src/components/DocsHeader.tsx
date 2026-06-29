import { Link, useLocation } from "react-router-dom";
import { Github, Menu, Search, X } from "lucide-react";

type DocsHeaderProps = {
  onSearchOpen: () => void;
  onSidebarToggle: () => void;
  sidebarOpen: boolean;
};

export function DocsHeader({
  onSearchOpen,
  onSidebarToggle,
  sidebarOpen,
}: DocsHeaderProps): React.JSX.Element {
  const location = useLocation();
  const isDocs = location.pathname === "/" || !location.pathname.startsWith("/download");

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
        <button
          type="button"
          className="rounded-md p-2 text-gray-600 hover:bg-gray-100 lg:hidden"
          onClick={onSidebarToggle}
          aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-gray-900">
          <img src="/icon.png" alt="" className="h-6 w-6" aria-hidden />
          <span className="hidden sm:inline">OPENHARNESS</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm md:flex">
          <Link
            to="/"
            className={isDocs ? "font-medium text-accent" : "text-gray-600 hover:text-gray-900"}
          >
            Docs
          </Link>
          <a
            href="https://openharness.dev"
            className="text-gray-600 hover:text-gray-900"
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onSearchOpen}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-500 hover:border-gray-300 hover:bg-gray-100"
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search docs…</span>
            <kbd className="hidden rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-400 sm:inline">
              ⌘K
            </kbd>
          </button>

          <a
            href="https://github.com/simonepriuli/openharness"
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="GitHub"
          >
            <Github size={18} />
          </a>
        </div>
      </div>
    </header>
  );
}
