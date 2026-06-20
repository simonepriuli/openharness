import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const githubInstallation = pgTable(
  "github_installation",
  {
    id: text("id").primaryKey(),
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
  (table) => [index("github_installation_userId_idx").on(table.userId)],
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
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectPath: text("project_path").notNull(),
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
    uniqueIndex("project_github_connection_user_project_idx").on(table.userId, table.projectPath),
    index("project_github_connection_userId_idx").on(table.userId),
  ],
);
