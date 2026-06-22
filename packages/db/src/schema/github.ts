import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";

export const workflowTypes = ["pr_review", "comment_fixer"] as const;
export type WorkflowType = (typeof workflowTypes)[number];

export const workflowRunStatuses = [
  "pending",
  "claimed",
  "running",
  "done",
  "failed",
] as const;
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];

export const githubInstallation = pgTable(
  "github_installation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull().unique(),
    accountLogin: text("account_login").notNull(),
    accountType: text("account_type").notNull(),
    repositorySelection: text("repository_selection").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("github_installation_organizationId_idx").on(table.organizationId),
    index("github_installation_userId_idx").on(table.userId),
  ],
);

export const githubInstallationRepo = pgTable(
  "github_installation_repo",
  {
    id: text("id").primaryKey(),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallation.installationId, { onDelete: "cascade" }),
    githubRepoId: text("github_repo_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("github_installation_repo_unique_idx").on(
      table.installationId,
      table.githubRepoId,
    ),
    index("github_installation_repo_installationId_idx").on(table.installationId),
  ],
);

export const projectGithubConnection = pgTable(
  "project_github_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    githubOwner: text("github_owner").notNull(),
    githubRepo: text("github_repo").notNull(),
    githubRepoId: text("github_repo_id").notNull(),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallation.installationId, { onDelete: "cascade" }),
    remoteUrl: text("remote_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("project_github_connection_org_repo_idx").on(
      table.organizationId,
      table.installationId,
      table.githubOwner,
      table.githubRepo,
    ),
    index("project_github_connection_organizationId_idx").on(table.organizationId),
    index("project_github_connection_userId_idx").on(table.userId),
    index("project_github_connection_repo_idx").on(
      table.githubOwner,
      table.githubRepo,
      table.installationId,
    ),
  ],
);

export const runnerRepoBinding = pgTable(
  "runner_repo_binding",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    runnerInstanceId: text("runner_instance_id").notNull(),
    projectGithubConnectionId: text("project_github_connection_id")
      .notNull()
      .references(() => projectGithubConnection.id, { onDelete: "cascade" }),
    projectPath: text("project_path").notNull(),
    label: text("label"),
    lastSeenAt: timestamp("last_seen_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("runner_repo_binding_runner_connection_idx").on(
      table.runnerInstanceId,
      table.projectGithubConnectionId,
    ),
    index("runner_repo_binding_organizationId_idx").on(table.organizationId),
    index("runner_repo_binding_userId_idx").on(table.userId),
    index("runner_repo_binding_connectionId_idx").on(table.projectGithubConnectionId),
    index("runner_repo_binding_runnerInstanceId_idx").on(table.runnerInstanceId),
  ],
);

/** @deprecated Migrated to `workflow`; kept for one-time legacy reads */
export const workflowSetting = pgTable(
  "workflow_setting",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectGithubConnectionId: text("project_github_connection_id")
      .notNull()
      .references(() => projectGithubConnection.id, { onDelete: "cascade" }),
    workflowType: text("workflow_type").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("workflow_setting_connection_type_idx").on(
      table.projectGithubConnectionId,
      table.workflowType,
    ),
    index("workflow_setting_organizationId_idx").on(table.organizationId),
    index("workflow_setting_userId_idx").on(table.userId),
  ],
);

export const workflow = pgTable(
  "workflow",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectGithubConnectionId: text("project_github_connection_id")
      .notNull()
      .references(() => projectGithubConnection.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Untitled"),
    enabled: boolean("enabled").notNull().default(false),
    model: text("model").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    targetBranch: text("target_branch").notNull().default(""),
    triggers: jsonb("triggers").notNull().default([]),
    tools: jsonb("tools").notNull().default({}),
    legacyWorkflowType: text("legacy_workflow_type"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workflow_organizationId_idx").on(table.organizationId),
    index("workflow_userId_idx").on(table.userId),
    index("workflow_connectionId_idx").on(table.projectGithubConnectionId),
  ],
);

export const workflowRun = pgTable(
  "workflow_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectGithubConnectionId: text("project_github_connection_id")
      .notNull()
      .references(() => projectGithubConnection.id, { onDelete: "cascade" }),
    projectPath: text("project_path"),
    installationId: text("installation_id")
      .notNull()
      .references(() => githubInstallation.installationId, { onDelete: "cascade" }),
    githubOwner: text("github_owner").notNull(),
    githubRepo: text("github_repo").notNull(),
    prNumber: integer("pr_number").notNull(),
    workflowId: text("workflow_id").references(() => workflow.id, { onDelete: "set null" }),
    workflowType: text("workflow_type"),
    event: text("event").notNull(),
    deliveryId: text("delivery_id").notNull(),
    status: text("status").notNull().default("pending"),
    claimedBy: text("claimed_by"),
    iteration: integer("iteration").notNull().default(0),
    payload: jsonb("payload").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("workflow_run_deliveryId_idx").on(table.deliveryId),
    index("workflow_run_org_status_idx").on(table.organizationId, table.status),
    index("workflow_run_user_status_idx").on(table.userId, table.status),
    index("workflow_run_pr_idx").on(
      table.githubOwner,
      table.githubRepo,
      table.prNumber,
      table.workflowType,
    ),
    index("workflow_run_workflowId_idx").on(table.workflowId),
  ],
);
