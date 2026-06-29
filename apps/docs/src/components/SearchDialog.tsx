import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import type { SearchResult } from "../lib/types";
import { buildSearchIndex } from "../lib/content";

type SearchDialogProps = {
  open: boolean;
  onClose: () => void;
};

function scoreResult(query: string, result: SearchResult): number {
  const q = query.toLowerCase();
  const title = result.title.toLowerCase();
  const description = result.description.toLowerCase();
  const snippet = result.snippet.toLowerCase();

  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (description.includes(q)) return 40;
  if (snippet.includes(q)) return 20;
  return 0;
}

export function SearchDialog({ open, onClose }: SearchDialogProps): React.JSX.Element | null {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const index = useMemo(() => buildSearchIndex(), []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return index.slice(0, 8);
    return index
      .map((result) => ({ result, score: scoreResult(q, result) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((item) => item.result);
  }, [index, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[15vh]">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close search"
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4">
          <Search size={16} className="text-gray-400" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documentation…"
            className="flex-1 py-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-gray-500">No results found</li>
          ) : (
            results.map((result) => (
              <li key={result.slug}>
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-50"
                  onClick={() => {
                    navigate(result.slug);
                    onClose();
                  }}
                >
                  <p className="text-sm font-medium text-gray-900">{result.title}</p>
                  {result.description ? (
                    <p className="mt-0.5 text-xs text-gray-500">{result.description}</p>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function useSearchShortcut(onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
