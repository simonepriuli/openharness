import { relations } from "drizzle-orm";
import { account, invitation, member, organization, session, user } from "./auth.js";
import {
  projectSourceControlConnection,
  runnerRepoBinding,
  sourceControlConnection,
  sourceControlRepo,
  workflow,
  workflowRun,
  workflowSetting,
} from "./source-control.js";
import { teamsChannelRepoMapping, teamsInstallation } from "./teams.js";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  sourceControlConnections: many(sourceControlConnection),
  projectSourceControlConnections: many(projectSourceControlConnection),
  runnerRepoBindings: many(runnerRepoBinding),
  teamsInstallations: many(teamsInstallation),
  teamsChannelRepoMappings: many(teamsChannelRepoMapping),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
  sourceControlConnections: many(sourceControlConnection),
  projectSourceControlConnections: many(projectSourceControlConnection),
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

export const sourceControlConnectionRelations = relations(
  sourceControlConnection,
  ({ many, one }) => ({
    organization: one(organization, {
      fields: [sourceControlConnection.organizationId],
      references: [organization.id],
    }),
    user: one(user, {
      fields: [sourceControlConnection.userId],
      references: [user.id],
    }),
    repos: many(sourceControlRepo),
    projectConnections: many(projectSourceControlConnection),
  }),
);

export const sourceControlRepoRelations = relations(sourceControlRepo, ({ one }) => ({
  connection: one(sourceControlConnection, {
    fields: [sourceControlRepo.connectionId],
    references: [sourceControlConnection.id],
  }),
}));

export const projectSourceControlConnectionRelations = relations(
  projectSourceControlConnection,
  ({ one, many }) => ({
    organization: one(organization, {
      fields: [projectSourceControlConnection.organizationId],
      references: [organization.id],
    }),
    user: one(user, {
      fields: [projectSourceControlConnection.userId],
      references: [user.id],
    }),
    connection: one(sourceControlConnection, {
      fields: [projectSourceControlConnection.connectionId],
      references: [sourceControlConnection.id],
    }),
    workflowSettings: many(workflowSetting),
    workflows: many(workflow),
    workflowRuns: many(workflowRun),
    runnerBindings: many(runnerRepoBinding),
    teamsChannelMappings: many(teamsChannelRepoMapping),
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
  connection: one(projectSourceControlConnection, {
    fields: [runnerRepoBinding.projectSourceControlConnectionId],
    references: [projectSourceControlConnection.id],
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
  connection: one(projectSourceControlConnection, {
    fields: [workflowSetting.projectSourceControlConnectionId],
    references: [projectSourceControlConnection.id],
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
  connection: one(projectSourceControlConnection, {
    fields: [workflow.projectSourceControlConnectionId],
    references: [projectSourceControlConnection.id],
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
  connection: one(projectSourceControlConnection, {
    fields: [workflowRun.projectSourceControlConnectionId],
    references: [projectSourceControlConnection.id],
  }),
  workflow: one(workflow, {
    fields: [workflowRun.workflowId],
    references: [workflow.id],
  }),
  sourceControlConnection: one(sourceControlConnection, {
    fields: [workflowRun.connectionId],
    references: [sourceControlConnection.id],
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
  projectConnection: one(projectSourceControlConnection, {
    fields: [teamsChannelRepoMapping.projectSourceControlConnectionId],
    references: [projectSourceControlConnection.id],
  }),
}));

// Legacy aliases
export const githubInstallationRelations = sourceControlConnectionRelations;
export const githubInstallationRepoRelations = sourceControlRepoRelations;
export const projectGithubConnectionRelations = projectSourceControlConnectionRelations;
