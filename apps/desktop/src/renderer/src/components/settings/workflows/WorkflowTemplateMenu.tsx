import { Clock01Icon, GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type { WorkflowTemplate, WorkflowTemplateId } from "../../../../../preload/api";
import { SettingsTabs } from "../SettingsTabs";

type WorkflowTemplateMenuProps = {
  templates: WorkflowTemplate[];
  onApply: (template: WorkflowTemplate) => void;
};

const CATEGORIES = [
  { id: "code_review", label: "Code Review" },
  { id: "security", label: "Security" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

const TEMPLATE_CATEGORIES: Record<WorkflowTemplateId, CategoryId[]> = {
  pr_review: ["code_review"],
  comment_fixer: ["code_review"],
};

export function WorkflowTemplateMenu({ templates, onApply }: WorkflowTemplateMenuProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("code_review");

  const visibleTemplates = useMemo(
    () =>
      templates.filter((template) =>
        (TEMPLATE_CATEGORIES[template.id] ?? []).includes(activeCategory),
      ),
    [activeCategory, templates],
  );

  return (
    <section className="workflow-template-gallery" aria-label="Starting templates">
      <h3 className="workflow-detail-label workflow-template-gallery-title">Starting templates</h3>
      <SettingsTabs
        items={CATEGORIES}
        value={activeCategory}
        onChange={setActiveCategory}
        ariaLabel="Template categories"
      />

      {visibleTemplates.length > 0 ? (
        <div className="workflow-template-gallery-grid">
          {visibleTemplates.map((template) => (
            <article key={template.id} className="workflow-template-card">
              <div className="workflow-template-card-icons" aria-hidden>
                <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.75} />
                <span className="workflow-template-card-icon-divider" />
                <HugeiconsIcon icon={GitPullRequestIcon} size={14} strokeWidth={1.75} />
              </div>
              <h4 className="workflow-template-card-title">{template.name}</h4>
              <p className="workflow-template-card-description">{template.description}</p>
              <button
                type="button"
                className="workflow-template-card-add"
                onClick={() => onApply(template)}
              >
                Use
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="workflow-template-gallery-empty settings-muted text-sm">
          No templates in this category yet.
        </p>
      )}
    </section>
  );
}
