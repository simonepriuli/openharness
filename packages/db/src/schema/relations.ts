import { relations } from "drizzle-orm";
import { account, session, user } from "./auth.js";
import {
  githubInstallation,
  githubInstallationRepo,
  projectGithubConnection,
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

export const projectGithubConnectionRelations = relations(projectGithubConnection, ({ one }) => ({
  user: one(user, {
    fields: [projectGithubConnection.userId],
    references: [user.id],
  }),
  installation: one(githubInstallation, {
    fields: [projectGithubConnection.installationId],
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
