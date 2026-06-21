import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type WorkflowBranchPickerProps = {
  open: boolean;
  owner: string;
  repo: string;
  branch: string;
  onClose: () => void;
  onBranchChange: (branch: string) => void;
};

export function WorkflowBranchPicker({
  open,
  owner,
  repo,
  branch,
  onClose,
  onBranchChange,
}: WorkflowBranchPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBranches = useCallback(async () => {
    if (!owner || !repo) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.harness.listRepoBranches({ owner, repo });
      setBranches(result.branches);
      setDefaultBranch(result.defaultBranch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branches");
    } finally {
      setLoading(false);
    }
  }, [owner, repo]);

  useEffect(() => {
    if (!open) return;
    void loadBranches();
  }, [loadBranches, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose, open]);

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((name) => name.toLowerCase().includes(q));
  }, [branches, query]);

  const selectBranch = (name: string) => {
    onBranchChange(name);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="workflow-repo-picker workflow-branch-picker"
      role="dialog"
      aria-label="Select branch"
    >
      <div className="workflow-repo-picker-search-wrap">
        <input
          type="search"
          className="workflow-repo-picker-search"
          placeholder="Search branches…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      <div className="workflow-repo-picker-scroll">
        <section className="workflow-repo-picker-section">
          {loading ? (
            <p className="workflow-repo-picker-empty">Loading branches…</p>
          ) : error ? (
            <p className="workflow-repo-picker-empty workflow-repo-picker-error">{error}</p>
          ) : filteredBranches.length === 0 ? (
            <p className="workflow-repo-picker-empty">No branches found.</p>
          ) : (
            filteredBranches.map((name) => {
              const selected = name === branch;
              const isDefault = name === defaultBranch;
              return (
                <button
                  key={name}
                  type="button"
                  className={`workflow-repo-picker-item${
                    selected ? " workflow-repo-picker-item-selected" : ""
                  }`}
                  onClick={() => selectBranch(name)}
                >
                  <span>{name}</span>
                  {isDefault ? (
                    <span className="workflow-branch-picker-default-badge">default</span>
                  ) : null}
                </button>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
