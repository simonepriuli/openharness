import type {
  SourceControlProviderId,
  WorkflowConfigSnapshot,
  WorkflowRunExecutionRecord,
  WorkflowRunResultPayload,
  WorkflowTools,
} from "@openharness/shared/workflow-run";

export type PrContextComment = {
  id: string;
  body: string;
  authorLogin?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: string;
  reviewId?: string;
};

export type PrContextThread = {
  id: string;
  isResolved?: boolean;
  path?: string;
  line?: number | null;
  side?: string;
  comments: PrContextComment[];
};

export type PrContext = {
  provider: SourceControlProviderId;
  pullRequest: {
    number: number;
    title: string;
    body: string | null;
    url: string;
    headRef: string;
    headSha?: string;
    baseRef?: string;
    baseSha?: string;
  };
  diff: string;
  threads: PrContextThread[];
  issueComments: PrContextComment[];
  files?: Array<{ path: string; patch?: string | null }>;
};

export type GitCredentials = {
  username: string;
  token: string;
  remoteUrl: string;
};

export type WorkflowRunExecutionContext = {
  run: WorkflowRunExecutionRecord;
  workflowConfig: WorkflowConfigSnapshot | null;
};

export type WorkflowStatusUpdateFields = {
  errorMessage?: string;
  iteration?: number;
  resultMarkdown?: string;
  resultPayload?: WorkflowRunResultPayload | null;
  teamsAssistantText?: string;
};

export type WorkflowRunApiClient = {
  getRun(runId: string): Promise<WorkflowRunExecutionContext>;
  updateStatus(
    runId: string,
    status: "running" | "done" | "failed",
    fields?: WorkflowStatusUpdateFields,
  ): Promise<void>;
  fetchPrContext(
    provider: SourceControlProviderId,
    namespace: string,
    repo: string,
    prNumber: number,
  ): Promise<PrContext>;
  fetchGitCredentials(
    provider: SourceControlProviderId,
    namespace: string,
    repo: string,
  ): Promise<GitCredentials>;
};

export type WorkflowGitOps = {
  isGitRepository(cwd: string): Promise<boolean>;
  preparePrWorktree(options: {
    repoCwd: string;
    worktreesRoot: string;
    owner: string;
    repo: string;
    prNumber: number;
    headRef: string;
    headSha: string;
    credentials?: GitCredentials;
  }): Promise<{ worktreePath: string; branchName: string }>;
  prepareBranchWorktree(options: {
    repoCwd: string;
    worktreesRoot: string;
    owner: string;
    repo: string;
    branch: string;
    credentials?: GitCredentials;
  }): Promise<{ worktreePath: string; branchName: string }>;
};

export type PiSpawnConfig = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

export type HeadlessPiRunOptions = {
  cwd: string;
  prompt: string;
  model?: { provider: string; modelId: string } | null;
  env?: NodeJS.ProcessEnv;
  onEvent?: (event: unknown) => void;
};

export type HeadlessPiRunResult = {
  messages: unknown[];
  assistantText: string;
};

export type WorkflowPiRunner = {
  run(options: HeadlessPiRunOptions): Promise<HeadlessPiRunResult>;
  onAuthFileReleased?: (env: NodeJS.ProcessEnv) => void;
};

export type WorkflowEventSink = {
  append(event: unknown): void;
  snapshotMessages(): unknown[];
  setMessages?(messages: unknown[]): void;
  flush?(): Promise<void>;
};

export type WorkflowSecrets = {
  buildGithubActionsEnv(
    run: WorkflowRunExecutionRecord,
    tools: WorkflowTools,
    prNumber?: number,
  ): Promise<NodeJS.ProcessEnv>;
  resolveSummarizationModelRef(): string;
  buildPiProcessEnv?(cwd: string): Promise<NodeJS.ProcessEnv>;
};

export type WorkflowExecutorDeps = {
  api: WorkflowRunApiClient;
  git: WorkflowGitOps;
  pi: WorkflowPiRunner;
  events: WorkflowEventSink;
  secrets: WorkflowSecrets;
  worktreesRoot: string;
  projectPath: string;
};
