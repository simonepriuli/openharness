/** @deprecated Import from ./source-control.js instead */
export {
  sourceControlProviders,
  type SourceControlProvider,
  workflowTypes,
  type WorkflowType,
  workflowRunStatuses,
  type WorkflowRunStatus,
  sourceControlConnection,
  sourceControlRepo,
  projectSourceControlConnection,
  runnerRepoBinding,
  workflowSetting,
  workflow,
  workflowRun,
  // Legacy names used during migration
  sourceControlConnection as githubInstallation,
  sourceControlRepo as githubInstallationRepo,
  projectSourceControlConnection as projectGithubConnection,
} from "./source-control.js";
