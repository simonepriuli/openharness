import type { SourceControlProvider } from "@openharness/db/schema";

export type PrContextPullRequest = {
  number: number;
  title: string;
  body: string | null;
  url: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
};

export type PrContextFile = {
  path: string;
  patch?: string | null;
};

export type PrContextComment = {
  id: string;
  body: string;
  authorId?: string;
  authorName?: string;
  reviewId?: string;
};

export type PrContextThread = {
  id: string;
  isResolved: boolean;
  path?: string;
  line?: number;
  comments: PrContextComment[];
};

export type PrContext = {
  provider: SourceControlProvider;
  pullRequest: PrContextPullRequest;
  files: PrContextFile[];
  diff: string;
  threads: PrContextThread[];
  issueComments: PrContextComment[];
};

export type GitCredentials = {
  username: string;
  token: string;
  remoteUrl: string;
};

export type InlineCommentInput = {
  path: string;
  line: number;
  body: string;
  side?: "RIGHT" | "LEFT";
  commitId?: string;
};

export type SubmitReviewInput = {
  event: "APPROVE" | "COMMENT";
  body: string;
  commitId?: string;
  comments?: InlineCommentInput[];
};

export type AutomationIdentity = {
  kind: "github_bot" | "ado_service_account";
  login?: string;
  id?: string;
  displayName?: string;
};
