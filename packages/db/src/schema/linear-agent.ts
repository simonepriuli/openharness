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
import { linearProjectRepoMapping } from "./linear.js";
import { projectSourceControlConnection, sourceControlConnection } from "./source-control.js";

export {
  linearAgentSessionStatuses,
  linearAgentRunStatuses,
  linearAgentTriggers,
  type LinearAgentSessionStatus,
  type LinearAgentRunStatus,
  type LinearAgentTrigger,
} from "./linear-agent-types.js";

export const linearAgentConfig = pgTable(
  "linear_agent_config",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    mappingId: text("mapping_id")
      .notNull()
      .references(() => linearProjectRepoMapping.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    model: text("model").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    targetBranch: text("target_branch").notNull().default("main"),
    tools: jsonb("tools").notNull().default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("linear_agent_config_mapping_idx").on(table.mappingId),
    index("linear_agent_config_organizationId_idx").on(table.organizationId),
  ],
);

export const linearAgentSession = pgTable(
  "linear_agent_session",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    mappingId: text("mapping_id").references(() => linearProjectRepoMapping.id, {
      onDelete: "set null",
    }),
    linearAgentSessionId: text("linear_agent_session_id").notNull(),
    linearIssueId: text("linear_issue_id"),
    issueIdentifier: text("issue_identifier"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("linear_agent_session_linear_id_idx").on(table.linearAgentSessionId),
    index("linear_agent_session_organizationId_idx").on(table.organizationId),
  ],
);

export const linearAgentRun = pgTable(
  "linear_agent_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => linearAgentSession.id, { onDelete: "cascade" }),
    mappingId: text("mapping_id").references(() => linearProjectRepoMapping.id, {
      onDelete: "set null",
    }),
    projectSourceControlConnectionId: text("project_source_control_connection_id").references(
      () => projectSourceControlConnection.id,
      { onDelete: "set null" },
    ),
    connectionId: text("connection_id").references(() => sourceControlConnection.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull(),
    namespace: text("namespace").notNull(),
    repoName: text("repo_name").notNull(),
    trigger: text("trigger").notNull(),
    deliveryId: text("delivery_id").notNull(),
    status: text("status").notNull().default("pending"),
    claimedBy: text("claimed_by"),
    runnerKind: text("runner_kind"),
    payload: jsonb("payload").notNull().default({}),
    errorMessage: text("error_message"),
    resultMarkdown: text("result_markdown"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("linear_agent_run_deliveryId_idx").on(table.deliveryId),
    index("linear_agent_run_org_status_idx").on(table.organizationId, table.status),
    index("linear_agent_run_sessionId_idx").on(table.sessionId),
  ],
);

export const linearAgentRunEvent = pgTable(
  "linear_agent_run_event",
  {
    id: text("id").primaryKey(),
    linearAgentRunId: text("linear_agent_run_id")
      .notNull()
      .references(() => linearAgentRun.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    event: jsonb("event").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("linear_agent_run_event_run_seq_idx").on(table.linearAgentRunId, table.seq),
    index("linear_agent_run_event_organizationId_idx").on(table.organizationId),
  ],
);
