import { PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useState } from "react";
import { MarkdownContent } from "../MarkdownContent";

type ProjectPlanPanelProps = {
  cwd: string | null;
  conversationId: string | null;
  planPhase: "interview" | "ready" | "implementing" | null;
  refreshKey: number;
  enabled: boolean;
  onImplementPlan: () => void;
  implementing?: boolean;
};

export function ProjectPlanPanel({
  cwd,
  conversationId,
  planPhase,
  refreshKey,
  enabled,
  onImplementPlan,
  implementing = false,
}: ProjectPlanPanelProps) {
  const [contents, setContents] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    if (!cwd || !conversationId || !enabled) {
      setContents(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await window.harness.getPlanFile({ cwd, conversationId });
      if (result.ok) {
        setContents(result.contents);
      } else if (result.missing) {
        setContents(null);
      } else {
        setContents(null);
        setError(result.error ?? "Failed to load plan");
      }
    } catch (err) {
      setContents(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [cwd, conversationId, enabled]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan, refreshKey]);

  if (!cwd) {
    return <div className="project-explorer-placeholder">Open a project to view plans.</div>;
  }

  if (!conversationId) {
    return <div className="project-explorer-placeholder">Start a conversation to create a plan.</div>;
  }

  if (loading) {
    return <div className="project-explorer-placeholder">Loading plan…</div>;
  }

  if (error) {
    return <div className="project-explorer-placeholder">{error}</div>;
  }

  if (!contents?.trim()) {
    return (
      <div className="project-explorer-placeholder">
        {planPhase === "interview"
          ? "Plan mode is active. The agent will interview you, then write the plan here."
          : "No plan yet. Enable Plan mode in the composer (Shift+Tab) and send a prompt."}
      </div>
    );
  }

  const showImplement = planPhase === "ready";

  return (
    <div className="project-plan-panel">
      <div className="project-plan-scroll">
        <div className="project-plan-scroll-inner">
          <MarkdownContent content={contents} />
        </div>
      </div>
      {showImplement ? (
        <div className="project-plan-footer">
          <button
            type="button"
            className="composer-question-primary-btn project-plan-implement-btn"
            disabled={implementing}
            onClick={onImplementPlan}
          >
            <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.8} aria-hidden />
            {implementing ? "Starting…" : "Implement plan"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
