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

export const sourceControlProviders = ["github", "azure_devops"] as const;
export type SourceControlProvider = (typeof sourceControlProviders)[number];

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

export const sourceControlConnection = pgTable(
  "source_control_connection",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().$type<SourceControlProvider>(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    externalOrgId: text("external_org_id").notNull(),
    displayName: text("display_name").notNull(),
    credentialsEncrypted: text("credentials_encrypted"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_control_connection_provider_org_external_idx").on(
      table.provider,
      table.organizationId,
      table.externalOrgId,
    ),
    index("source_control_connection_organizationId_idx").on(table.organizationId),
    index("source_control_connection_userId_idx").on(table.userId),
    index("source_control_connection_provider_idx").on(table.provider),
  ],
);

export const sourceControlRepo = pgTable(
  "source_control_repo",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => sourceControlConnection.id, { onDelete: "cascade" }),
    externalRepoId: text("external_repo_id").notNull(),
    namespace: text("namespace").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("source_control_repo_connection_external_idx").on(
      table.connectionId,
      table.externalRepoId,
    ),
    index("source_control_repo_connectionId_idx").on(table.connectionId),
    index("source_control_repo_namespace_name_idx").on(table.namespace, table.name),
  ],
);

export const projectSourceControlConnection = pgTable(
  "project_source_control_connection",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => sourceControlConnection.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<SourceControlProvider>(),
    namespace: text("namespace").notNull(),
    name: text("name").notNull(),
    externalRepoId: text("external_repo_id").notNull(),
    remoteUrl: text("remote_url"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("project_source_control_connection_org_repo_idx").on(
      table.organizationId,
      table.connectionId,
      table.namespace,
      table.name,
    ),
    index("project_source_control_connection_organizationId_idx").on(table.organizationId),
    index("project_source_control_connection_userId_idx").on(table.userId),
    index("project_source_control_connection_connectionId_idx").on(table.connectionId),
    index("project_source_control_connection_repo_idx").on(
      table.provider,
      table.namespace,
      table.name,
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
    projectSourceControlConnectionId: text("project_source_control_connection_id")
      .notNull()
      .references(() => projectSourceControlConnection.id, { onDelete: "cascade" }),
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
      table.projectSourceControlConnectionId,
    ),
    index("runner_repo_binding_organizationId_idx").on(table.organizationId),
    index("runner_repo_binding_userId_idx").on(table.userId),
    index("runner_repo_binding_connectionId_idx").on(table.projectSourceControlConnectionId),
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
    projectSourceControlConnectionId: text("project_source_control_connection_id")
      .notNull()
      .references(() => projectSourceControlConnection.id, { onDelete: "cascade" }),
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
      table.projectSourceControlConnectionId,
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
    projectSourceControlConnectionId: text("project_source_control_connection_id")
      .notNull()
      .references(() => projectSourceControlConnection.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Untitled"),
    enabled: boolean("enabled").notNull().default(false),
    model: text("model").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    targetBranch: text("target_branch").notNull().default(""),
    triggers: jsonb("triggers").notNull().default([]),
    tools: jsonb("tools").notNull().default({}),
    legacyWorkflowType: text("legacy_workflow_type"),
    localOnly: boolean("local_only").notNull().default(false),
    executionTarget: text("execution_target").notNull().default("auto"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("workflow_organizationId_idx").on(table.organizationId),
    index("workflow_userId_idx").on(table.userId),
    index("workflow_connectionId_idx").on(table.projectSourceControlConnectionId),
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
    projectSourceControlConnectionId: text("project_source_control_connection_id")
      .notNull()
      .references(() => projectSourceControlConnection.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => sourceControlConnection.id, { onDelete: "cascade" }),
    projectPath: text("project_path"),
    provider: text("provider").notNull().$type<SourceControlProvider>(),
    namespace: text("namespace").notNull(),
    repoName: text("repo_name").notNull(),
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
    resultMarkdown: text("result_markdown"),
    resultPayload: jsonb("result_payload"),
    resolvedExecutor: text("resolved_executor").notNull().default("local"),
    runnerKind: text("runner_kind"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("workflow_run_deliveryId_idx").on(table.deliveryId),
    index("workflow_run_org_status_idx").on(table.organizationId, table.status),
    index("workflow_run_org_status_executor_idx").on(
      table.organizationId,
      table.status,
      table.resolvedExecutor,
    ),
    index("workflow_run_user_status_idx").on(table.userId, table.status),
    index("workflow_run_pr_idx").on(
      table.provider,
      table.namespace,
      table.repoName,
      table.prNumber,
      table.workflowType,
    ),
    index("workflow_run_workflowId_idx").on(table.workflowId),
  ],
);

export const repoEnvironmentVariable = pgTable(
  "repo_environment_variable",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectSourceControlConnectionId: text("project_source_control_connection_id")
      .notNull()
      .references(() => projectSourceControlConnection.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueEncrypted: text("value_encrypted").notNull(),
    isSecret: boolean("is_secret").notNull().default(false),
    description: text("description"),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("repo_environment_variable_connection_key_idx").on(
      table.projectSourceControlConnectionId,
      table.key,
    ),
    index("repo_environment_variable_organizationId_idx").on(table.organizationId),
    index("repo_environment_variable_connectionId_idx").on(
      table.projectSourceControlConnectionId,
    ),
  ],
);

export const workflowRunEvent = pgTable(
  "workflow_run_event",
  {
    id: text("id").primaryKey(),
    workflowRunId: text("workflow_run_id")
      .notNull()
      .references(() => workflowRun.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    event: jsonb("event").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workflow_run_event_run_seq_idx").on(table.workflowRunId, table.seq),
    index("workflow_run_event_organizationId_idx").on(table.organizationId),
  ],
);

// Legacy GitHub table aliases for migration scripts
export const githubInstallation = sourceControlConnection;
export const githubInstallationRepo = sourceControlRepo;
export const projectGithubConnection = projectSourceControlConnection;
