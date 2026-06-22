import { relations } from "drizzle-orm";
import { account, invitation, member, organization, session, user } from "./auth.js";
import {
  githubInstallation,
  githubInstallationRepo,
  projectGithubConnection,
  runnerRepoBinding,
  workflow,
  workflowRun,
  workflowSetting,
} from "./github.js";
import { teamsChannelRepoMapping, teamsInstallation } from "./teams.js";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  githubInstallations: many(githubInstallation),
  projectGithubConnections: many(projectGithubConnection),
  runnerRepoBindings: many(runnerRepoBinding),
  teamsInstallations: many(teamsInstallation),
  teamsChannelRepoMappings: many(teamsChannelRepoMapping),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  githubInstallations: many(githubInstallation),
  projectGithubConnections: many(projectGithubConnection),
  runnerRepoBindings: many(runnerRepoBinding),
  workflows: many(workflow),
  workflowRuns: many(workflowRun),
  teamsInstallations: many(teamsInstallation),
  teamsChannelRepoMappings: many(teamsChannelRepoMapping),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const githubInstallationRelations = relations(githubInstallation, ({ many, one }) => ({
  organization: one(organization, {
    fields: [githubInstallation.organizationId],
    references: [organization.id],
  }),
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
    organization: one(organization, {
      fields: [projectGithubConnection.organizationId],
      references: [organization.id],
    }),
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
    runnerBindings: many(runnerRepoBinding),
  }),
);

export const runnerRepoBindingRelations = relations(runnerRepoBinding, ({ one }) => ({
  organization: one(organization, {
    fields: [runnerRepoBinding.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [runnerRepoBinding.userId],
    references: [user.id],
  }),
  connection: one(projectGithubConnection, {
    fields: [runnerRepoBinding.projectGithubConnectionId],
    references: [projectGithubConnection.id],
  }),
}));

export const workflowSettingRelations = relations(workflowSetting, ({ one }) => ({
  organization: one(organization, {
    fields: [workflowSetting.organizationId],
    references: [organization.id],
  }),
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
  organization: one(organization, {
    fields: [workflow.organizationId],
    references: [organization.id],
  }),
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
  organization: one(organization, {
    fields: [workflowRun.organizationId],
    references: [organization.id],
  }),
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
  activeOrganization: one(organization, {
    fields: [session.activeOrganizationId],
    references: [organization.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const teamsInstallationRelations = relations(teamsInstallation, ({ one, many }) => ({
  organization: one(organization, {
    fields: [teamsInstallation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [teamsInstallation.userId],
    references: [user.id],
  }),
  channelMappings: many(teamsChannelRepoMapping),
}));

export const teamsChannelRepoMappingRelations = relations(teamsChannelRepoMapping, ({ one }) => ({
  organization: one(organization, {
    fields: [teamsChannelRepoMapping.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [teamsChannelRepoMapping.userId],
    references: [user.id],
  }),
  installation: one(teamsInstallation, {
    fields: [teamsChannelRepoMapping.installationId],
    references: [teamsInstallation.id],
  }),
}));
