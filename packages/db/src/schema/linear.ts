import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.js";
import { projectSourceControlConnection } from "./source-control.js";

export const linearInstallation = pgTable(
  "linear_installation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull(),
    workspaceName: text("workspace_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at"),
    webhookId: text("webhook_id"),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    grantedScopes: text("granted_scopes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("linear_installation_org_workspace_idx").on(
      table.organizationId,
      table.workspaceId,
    ),
    index("linear_installation_organizationId_idx").on(table.organizationId),
    index("linear_installation_userId_idx").on(table.userId),
    index("linear_installation_webhookId_idx").on(table.webhookId),
  ],
);

export const linearProjectRepoMapping = pgTable(
  "linear_project_repo_mapping",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id")
      .notNull()
      .references(() => linearInstallation.id, { onDelete: "cascade" }),
    projectId: text("project_id").notNull(),
    projectName: text("project_name").notNull(),
    provider: text("provider").notNull(),
    namespace: text("namespace").notNull(),
    repoName: text("repo_name").notNull(),
    projectSourceControlConnectionId: text("project_source_control_connection_id").references(
      () => projectSourceControlConnection.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("linear_project_repo_mapping_org_repo_idx").on(
      table.organizationId,
      table.provider,
      table.namespace,
      table.repoName,
    ),
    uniqueIndex("linear_project_repo_mapping_org_project_idx").on(
      table.organizationId,
      table.projectId,
    ),
    index("linear_project_repo_mapping_projectId_idx").on(table.projectId),
    index("linear_project_repo_mapping_installationId_idx").on(table.installationId),
    index("linear_project_repo_mapping_organizationId_idx").on(table.organizationId),
  ],
);
