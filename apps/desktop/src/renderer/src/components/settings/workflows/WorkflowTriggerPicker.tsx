import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { AzureDevOpsIcon } from "../../icons/AzureDevOpsIcon";
import { DiscordIcon } from "../../icons/DiscordIcon";
import { GithubIcon } from "../../icons/GithubIcon";
import { MsTeamsIcon } from "../../icons/MsTeamsIcon";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  WorkflowSchedulePreset,
  WorkflowTriggerEvent,
  LinearTriggerEvent,
} from "../../../../../preload/api";

export type TriggerPickerSelection =
  | { type: "git_pr"; event: WorkflowTriggerEvent }
  | { type: "schedule"; preset: WorkflowSchedulePreset | "custom" }
  | { type: "teams_mention" }
  | { type: "discord_mention" }
  | { type: "linear"; event: LinearTriggerEvent };

type TriggerPickerIcon =
  | { type: "hugeicons"; icon: IconSvgElement }
  | { type: "github" }
  | { type: "azure_devops" }
  | { type: "teams" }
  | { type: "discord" };

type TriggerPickerItem = {
  id: string;
  label: string;
  searchTerms: string;
  icon: TriggerPickerIcon;
  children?: Array<{ id: string; label: string; searchTerms: string }>;
};

function buildPickerGroups(options: {
  sourceProvider: "github" | "azure_devops";
  includeTeams: boolean;
  includeDiscord: boolean;
  includeLinear: boolean;
}): TriggerPickerItem[] {
  const providerLabel = options.sourceProvider === "azure_devops" ? "Azure DevOps" : "GitHub";
  const providerSearchTerms =
    options.sourceProvider === "azure_devops"
      ? "azure devops ado pull request pr review comment"
      : "github pull request pr review comment";
  const providerIcon =
    options.sourceProvider === "azure_devops"
      ? ({ type: "azure_devops" } as const)
      : ({ type: "github" } as const);

  const groups: TriggerPickerItem[] = [
    {
      id: "git_pr",
      label: providerLabel,
      searchTerms: providerSearchTerms,
      icon: providerIcon,
      children: [
        { id: "pr_opened", label: "PR opened", searchTerms: "opened" },
        { id: "pr_updated", label: "PR updated", searchTerms: "updated synchronize" },
        { id: "pr_ready", label: "PR ready for review", searchTerms: "ready review" },
        { id: "pr_comment_on_diff", label: "Comment on PR diff", searchTerms: "comment diff inline" },
        { id: "review_submitted", label: "Review submitted", searchTerms: "review submitted" },
      ],
    },
    {
      id: "scheduled",
      label: "Scheduled",
      searchTerms: "scheduled cron timer clock hourly daily weekly",
      icon: { type: "hugeicons", icon: Clock01Icon },
      children: [
        { id: "hourly", label: "Hourly", searchTerms: "hourly every hour" },
        { id: "daily", label: "Daily", searchTerms: "daily every day" },
        { id: "weekly", label: "Weekly", searchTerms: "weekly every week" },
        { id: "custom", label: "Custom (cron)", searchTerms: "custom cron expression" },
      ],
    },
  ];

  if (options.includeTeams) {
    groups.push({
      id: "teams",
      label: "Microsoft Teams",
      searchTerms: "teams mention bot microsoft chat",
      icon: { type: "teams" },
      children: [{ id: "teams_mention", label: "Teams @mention", searchTerms: "mention bot" }],
    });
  }
  if (options.includeDiscord) {
    groups.push({
      id: "discord",
      label: "Discord",
      searchTerms: "discord mention bot slash command",
      icon: { type: "discord" },
      children: [{ id: "discord_mention", label: "Discord mention", searchTerms: "mention bot" }],
    });
  }

  if (options.includeLinear) {
    groups.push({
      id: "linear",
      label: "Linear",
      searchTerms: "linear issue comment project tracker",
      icon: { type: "hugeicons", icon: Clock01Icon },
      children: [
        {
          id: "linear_issue_created",
          label: "Issue created",
          searchTerms: "issue created new",
        },
        {
          id: "linear_issue_updated",
          label: "Issue updated",
          searchTerms: "issue updated status assignee",
        },
        {
          id: "linear_comment_created",
          label: "Comment created",
          searchTerms: "comment created",
        },
      ],
    });
  }

  return groups;
}

type FlyoutPosition = {
  top: number;
  left: number;
};

type WorkflowTriggerPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (selection: TriggerPickerSelection) => void;
  sourceProvider: "github" | "azure_devops";
  includeTeams?: boolean;
  includeDiscord?: boolean;
  includeLinear?: boolean;
};

export function WorkflowTriggerPicker({
  open,
  onClose,
  onSelect,
  sourceProvider,
  includeTeams = true,
  includeDiscord = true,
  includeLinear = true,
}: WorkflowTriggerPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const groupRowRefs = useRef(new Map<string, HTMLDivElement>());
  const [search, setSearch] = useState("");
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [flyoutPosition, setFlyoutPosition] = useState<FlyoutPosition | null>(null);
  const pickerGroups = useMemo(
    () => buildPickerGroups({ sourceProvider, includeTeams, includeDiscord, includeLinear }),
    [sourceProvider, includeTeams, includeDiscord, includeLinear],
  );

  const isSearchMode = search.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setHoveredGroup(null);
      setFlyoutPosition(null);
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pickerGroups;

    return pickerGroups.flatMap((group) => {
      const groupMatch =
        group.label.toLowerCase().includes(q) || group.searchTerms.toLowerCase().includes(q);
      const children = (group.children ?? []).filter(
        (child) =>
          child.label.toLowerCase().includes(q) ||
          child.searchTerms.toLowerCase().includes(q) ||
          groupMatch,
      );
      if (groupMatch || children.length > 0) {
        return [{ ...group, children }];
      }
      return [];
    });
  }, [search, pickerGroups]);

  const hoveredGroupData = hoveredGroup
    ? filteredGroups.find((group) => group.id === hoveredGroup)
    : null;

  useLayoutEffect(() => {
    if (isSearchMode || !hoveredGroup || !rootRef.current) {
      setFlyoutPosition(null);
      return;
    }

    const row = groupRowRefs.current.get(hoveredGroup);
    if (!row) {
      setFlyoutPosition(null);
      return;
    }

    const pickerRect = rootRef.current.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    setFlyoutPosition({
      top: rowRect.top - pickerRect.top - 8,
      left: pickerRect.width - 6,
    });
  }, [hoveredGroup, isSearchMode, filteredGroups]);

  const handleSelect = (groupId: string, childId: string) => {
    if (groupId === "git_pr") {
      onSelect({ type: "git_pr", event: childId as WorkflowTriggerEvent });
    } else if (groupId === "teams") {
      onSelect({ type: "teams_mention" });
    } else if (groupId === "discord") {
      onSelect({ type: "discord_mention" });
    } else if (groupId === "linear") {
      onSelect({ type: "linear", event: childId as LinearTriggerEvent });
    } else {
      onSelect({
        type: "schedule",
        preset: childId as WorkflowSchedulePreset | "custom",
      });
    }
    onClose();
  };

  const setGroupRowRef = (groupId: string) => (node: HTMLDivElement | null) => {
    if (node) {
      groupRowRefs.current.set(groupId, node);
    } else {
      groupRowRefs.current.delete(groupId);
    }
  };

  if (!open) return null;

  return (
    <div ref={rootRef} className="workflow-trigger-picker" role="dialog" aria-label="Add trigger">
      <input
        ref={searchRef}
        type="search"
        className="workflow-trigger-picker-search"
        placeholder="Search triggers…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />

      <div className="workflow-trigger-picker-body">
        {filteredGroups.length === 0 ? (
          <p className="workflow-trigger-picker-empty">No matching triggers</p>
        ) : (
          filteredGroups.map((group) => (
            <div
              key={group.id}
              className="workflow-trigger-picker-group"
              onMouseEnter={() => setHoveredGroup(group.id)}
            >
              <div
                ref={setGroupRowRef(group.id)}
                className={`workflow-trigger-picker-group-row${
                  hoveredGroup === group.id && !isSearchMode
                    ? " workflow-trigger-picker-group-row-active"
                    : ""
                }`}
              >
                {group.icon.type === "teams" ? (
                  <MsTeamsIcon size={16} className="workflow-trigger-picker-icon" />
                ) : group.icon.type === "discord" ? (
                  <DiscordIcon size={16} className="workflow-trigger-picker-icon" />
                ) : group.icon.type === "azure_devops" ? (
                  <AzureDevOpsIcon size={16} className="workflow-trigger-picker-icon" />
                ) : group.icon.type === "github" ? (
                  <GithubIcon size={16} className="workflow-trigger-picker-icon" />
                ) : (
                  <HugeiconsIcon
                    icon={group.icon.icon}
                    size={16}
                    className="workflow-trigger-picker-icon"
                  />
                )}
                <span>{group.label}</span>
                <span className="workflow-trigger-picker-chevron" aria-hidden>
                  ›
                </span>
              </div>

              {isSearchMode ? (
                <div className="workflow-trigger-picker-inline-children" role="menu">
                  {(group.children ?? []).map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className="workflow-trigger-picker-submenu-item"
                      role="menuitem"
                      onClick={() => handleSelect(group.id, child.id)}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {!isSearchMode && hoveredGroupData && flyoutPosition ? (
        <div
          className="workflow-trigger-picker-flyout"
          style={{ top: flyoutPosition.top, left: flyoutPosition.left }}
          role="menu"
          onMouseEnter={() => setHoveredGroup(hoveredGroupData.id)}
        >
          {(hoveredGroupData.children ?? []).map((child) => (
            <button
              key={child.id}
              type="button"
              className="workflow-trigger-picker-submenu-item"
              role="menuitem"
              onClick={() => handleSelect(hoveredGroupData.id, child.id)}
            >
              {child.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
