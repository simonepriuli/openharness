import { Clock01Icon, GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { useMemo, useState } from "react";
import type {
  WorkflowTemplate,
  WorkflowTemplateId,
  WorkflowTrigger,
} from "../../../../../preload/api";
import { MsTeamsIcon } from "../../icons/MsTeamsIcon";
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
  dependency_cve_scan: ["security"],
  teams_bug_triage: ["code_review"],
};

type TemplateCardIcon =
  | { type: "hugeicons"; icon: IconSvgElement }
  | { type: "teams" };

function triggerIcon(trigger: WorkflowTrigger): TemplateCardIcon {
  if (trigger.kind === "schedule") {
    return { type: "hugeicons", icon: Clock01Icon };
  }
  return { type: "hugeicons", icon: GitPullRequestIcon };
}

function templateCardIcons(template: WorkflowTemplate): TemplateCardIcon[] {
  const trigger = template.triggers[0];
  if (!trigger) return [];

  if (trigger.kind === "teams_mention") {
    return [{ type: "teams" }];
  }

  const icons: TemplateCardIcon[] = [triggerIcon(trigger)];
  if (template.tools.teamsNotify) {
    icons.push({ type: "teams" });
  }
  return icons;
}

function TemplateCardIconGlyph({ entry, size }: { entry: TemplateCardIcon; size: number }) {
  if (entry.type === "teams") {
    return <MsTeamsIcon size={size} />;
  }
  return <HugeiconsIcon icon={entry.icon} size={size} strokeWidth={1.75} />;
}

function TemplateCardIcons({ template }: { template: WorkflowTemplate }) {
  const icons = templateCardIcons(template);
  return (
    <div className="workflow-template-card-icons" aria-hidden>
      {icons.map((entry, index) => (
        <span key={`${template.id}-${index}`} className="workflow-template-card-icon-wrap">
          {index > 0 ? <span className="workflow-template-card-icon-divider" /> : null}
          <TemplateCardIconGlyph entry={entry} size={14} />
        </span>
      ))}
    </div>
  );
}

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
              <TemplateCardIcons template={template} />
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
