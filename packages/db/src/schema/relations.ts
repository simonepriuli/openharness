import { relations } from "drizzle-orm";
import { account, session, user } from "./auth.js";
import {
  githubInstallation,
  githubInstallationRepo,
  projectGithubConnection,
  workflow,
  workflowRun,
  workflowSetting,
} from "./github.js";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  githubInstallations: many(githubInstallation),
  projectGithubConnections: many(projectGithubConnection),
}));

export const githubInstallationRelations = relations(githubInstallation, ({ many, one }) => ({
  user: one(user, {
    fields: [githubInstallation.userId],
    references: [user.id],
  }),
  repos: many(githubInstallationRepo),
  projectConnections: many(projectGithubConnection),
}));

export const githubInstallationRepoRelations = relations(githubInstallationRepo, ({ one }) => ({
  installation: one(githubInstallation, {
    fields: [githubInstallationRepo.installationId],
    references: [githubInstallation.installationId],
  }),
}));

export const projectGithubConnectionRelations = relations(
  projectGithubConnection,
  ({ one, many }) => ({
    user: one(user, {
      fields: [projectGithubConnection.userId],
      references: [user.id],
    }),
    installation: one(githubInstallation, {
      fields: [projectGithubConnection.installationId],
      references: [githubInstallation.installationId],
    }),
    workflowSettings: many(workflowSetting),
    workflows: many(workflow),
    workflowRuns: many(workflowRun),
  }),
);

export const workflowSettingRelations = relations(workflowSetting, ({ one }) => ({
  user: one(user, {
    fields: [workflowSetting.userId],
    references: [user.id],
  }),
  connection: one(projectGithubConnection, {
    fields: [workflowSetting.projectGithubConnectionId],
    references: [projectGithubConnection.id],
  }),
}));

export const workflowRelations = relations(workflow, ({ one, many }) => ({
  user: one(user, {
    fields: [workflow.userId],
    references: [user.id],
  }),
  connection: one(projectGithubConnection, {
    fields: [workflow.projectGithubConnectionId],
    references: [projectGithubConnection.id],
  }),
  runs: many(workflowRun),
}));

export const workflowRunRelations = relations(workflowRun, ({ one }) => ({
  user: one(user, {
    fields: [workflowRun.userId],
    references: [user.id],
  }),
  connection: one(projectGithubConnection, {
    fields: [workflowRun.projectGithubConnectionId],
    references: [projectGithubConnection.id],
  }),
  workflow: one(workflow, {
    fields: [workflowRun.workflowId],
    references: [workflow.id],
  }),
  installation: one(githubInstallation, {
    fields: [workflowRun.installationId],
    references: [githubInstallation.installationId],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
