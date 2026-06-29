import { Copy, Check } from "lucide-react";
import { useCallback, useState } from "react";
import { useTocListener } from "../lib/use-toc";

export function DocsToc(): React.JSX.Element | null {
  const headings = useTocListener();
  const [copied, setCopied] = useState(false);

  const copyPage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, []);

  if (headings.length === 0) {
    return (
      <aside className="hidden w-48 shrink-0 xl:block">
        <div className="sticky top-20 space-y-4 py-8 pr-4">
          <button
            type="button"
            onClick={copyPage}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy page"}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden w-48 shrink-0 xl:block">
      <div className="sticky top-20 space-y-4 py-8 pr-4">
        <p className="text-xs font-semibold text-gray-900">On this page</p>
        <ul className="space-y-2 text-sm">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                className={`block text-gray-500 hover:text-accent ${
                  heading.level === 3 ? "pl-3" : ""
                }`}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={copyPage}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy page"}
        </button>
      </div>
    </aside>
  );
}
