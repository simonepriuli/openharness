// openharness-github-actions-version:4
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  approvePullRequest,
  createPullRequest,
  fetchPrContext,
  findOpenPullRequestForHead,
  pushBranch,
  submitPullRequestReview,
} from "./github-actions-client.js";
import { readGithubActionsConfig, type GithubActionsConfig } from "./config.js";

const InlineComment = Type.Object({
  path: Type.String({ description: "Repository-relative file path" }),
  line: Type.Integer({ minimum: 1, description: "Line number in the diff" }),
  body: Type.String({ description: "Review comment body" }),
});

const FindPullRequestParams = Type.Object({
  pr_number: Type.Optional(
    Type.Integer({ minimum: 1, description: "Pull request number to look up directly" }),
  ),
  head_ref: Type.Optional(
    Type.String({ description: "Branch name to find an open pull request for" }),
  ),
});

const ApproveParams = Type.Object({
  summary: Type.String({ description: "Approval review summary shown on the pull request" }),
  commit_id: Type.Optional(
    Type.String({ description: "Head commit SHA to attach the review to (recommended)" }),
  ),
  pr_number: Type.Optional(
    Type.Integer({ minimum: 1, description: "Pull request number when not running in a PR workflow" }),
  ),
});

const SubmitReviewParams = Type.Object({
  summary: Type.String({ description: "Review summary shown on the pull request" }),
  commit_id: Type.Optional(Type.String({ description: "Head commit SHA for inline comments" })),
  inline_comments: Type.Optional(
    Type.Array(InlineComment, { description: "Inline review comments on changed lines" }),
  ),
  pr_number: Type.Optional(
    Type.Integer({ minimum: 1, description: "Pull request number when not running in a PR workflow" }),
  ),
});

const CreatePullRequestParams = Type.Object({
  title: Type.String({ description: "Pull request title" }),
  body: Type.String({ description: "Pull request description" }),
  head: Type.Optional(
    Type.String({
      description: "Branch containing changes (defaults to the current git branch in the worktree)",
    }),
  ),
  base: Type.Optional(
    Type.String({ description: "Target branch to merge into (defaults to repository default branch)" }),
  ),
});

const PushBranchParams = Type.Object({
  commit_message: Type.Optional(
    Type.String({
      description: "Commit message when there are uncommitted changes (defaults to a generic message)",
    }),
  ),
  head_ref: Type.Optional(
    Type.String({ description: "Remote branch to push to (defaults to the current git branch)" }),
  ),
});

function toolError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
    details: {},
  };
}

function resolvePrNumber(config: GithubActionsConfig, explicit?: number): number | null {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return explicit;
  }
  if (config.prNumber) return config.prNumber;
  return null;
}

const PR_NUMBER_REQUIRED_MESSAGE =
  "Pull request number required. Call find_open_pull_request first, then pass pr_number.";

export default function openharnessGithubActions(pi: ExtensionAPI) {
  const config = readGithubActionsConfig();
  if (!config) return;

  pi.registerTool({
    name: "find_open_pull_request",
    label: "Find Pull Request",
    description:
      "Look up an open GitHub pull request by number or branch name before reviewing or approving it.",
    promptSnippet: "find_open_pull_request(pr_number?, head_ref?)",
    promptGuidelines: [
      "Use find_open_pull_request before submit_pull_request_review or approve_pull_request in threads.",
      "Provide pr_number when you already know it, or head_ref to search by branch name.",
    ],
    parameters: FindPullRequestParams,
    async execute(_toolCallId, params) {
      const prNumber = typeof params.pr_number === "number" ? params.pr_number : undefined;
      const headRef = typeof params.head_ref === "string" ? params.head_ref.trim() : "";

      if (prNumber) {
        try {
          const context = await fetchPrContext(config, prNumber);
          const pr = context.pullRequest;
          return {
            content: [
              {
                type: "text",
                text: [
                  `Pull request #${pr.number}: ${pr.title}`,
                  `URL: ${pr.url}`,
                  `Head: ${pr.headRef}`,
                  `Base: ${pr.baseRef}`,
                ].join("\n"),
              },
            ],
            details: {
              number: pr.number,
              title: pr.title,
              url: pr.url,
              headRef: pr.headRef,
              baseRef: pr.baseRef,
            },
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      }

      if (headRef) {
        try {
          const pull = await findOpenPullRequestForHead(config, headRef);
          if (!pull) {
            return toolError(`No open pull request found for branch "${headRef}".`);
          }
          return {
            content: [
              {
                type: "text",
                text: `Pull request #${pull.number}: ${pull.title}\nURL: ${pull.url}`,
              },
            ],
            details: pull,
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      }

      return toolError("Provide pr_number or head_ref.");
    },
  });

  if (config.enabledTools.has("approve_pull_request")) {
    pi.registerTool({
      name: "approve_pull_request",
      label: "Approve Pull Request",
      description: "Mark the pull request approved on GitHub when the changes are ready to merge.",
      promptSnippet: "approve_pull_request(summary, commit_id?)",
      promptGuidelines: [
        "Use approve_pull_request only when the pull request meets the workflow bar for approval.",
        "Call find_open_pull_request first in threads, then pass pr_number.",
        "Provide a concise summary explaining why the change is ready to merge.",
      ],
      parameters: ApproveParams,
      async execute(_toolCallId, params) {
        const prNumber = resolvePrNumber(
          config,
          typeof params.pr_number === "number" ? params.pr_number : undefined,
        );
        if (!prNumber) {
          return toolError(PR_NUMBER_REQUIRED_MESSAGE);
        }
        try {
          let commitId =
            typeof params.commit_id === "string" && params.commit_id.trim()
              ? params.commit_id.trim()
              : undefined;
          if (!commitId) {
            const context = await fetchPrContext(config, prNumber);
            commitId = context.pullRequest.headSha;
          }
          await approvePullRequest(config, prNumber, {
            summary: String(params.summary ?? "").trim(),
            commitId,
          });
          return {
            content: [
              {
                type: "text",
                text: `Approved pull request #${prNumber}.`,
              },
            ],
            details: { prNumber },
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }

  if (config.enabledTools.has("submit_pull_request_review")) {
    pi.registerTool({
      name: "submit_pull_request_review",
      label: "Review Pull Request",
      description:
        "Submit a full code review on GitHub: overall feedback plus optional inline notes on specific changed lines.",
      promptSnippet: "submit_pull_request_review(summary, inline_comments?, commit_id?)",
      promptGuidelines: [
        "Use submit_pull_request_review when the pull request needs a code review or requested changes.",
        "Call find_open_pull_request first in threads, then pass pr_number.",
        "Include a review summary and anchor inline notes to paths and line numbers from the diff.",
      ],
      parameters: SubmitReviewParams,
      async execute(_toolCallId, params) {
        const prNumber = resolvePrNumber(
          config,
          typeof params.pr_number === "number" ? params.pr_number : undefined,
        );
        if (!prNumber) {
          return toolError(PR_NUMBER_REQUIRED_MESSAGE);
        }
        try {
          let commitId =
            typeof params.commit_id === "string" && params.commit_id.trim()
              ? params.commit_id.trim()
              : undefined;
          if (!commitId) {
            const context = await fetchPrContext(config, prNumber);
            commitId = context.pullRequest.headSha;
          }
          const inlineComments = Array.isArray(params.inline_comments)
            ? params.inline_comments
                .map((row) => {
                  if (!row || typeof row !== "object") return null;
                  const item = row as { path?: string; line?: number; body?: string };
                  if (!item.path?.trim() || typeof item.line !== "number" || !item.body?.trim()) {
                    return null;
                  }
                  return {
                    path: item.path.trim(),
                    line: item.line,
                    body: item.body.trim(),
                  };
                })
                .filter((row): row is { path: string; line: number; body: string } => row !== null)
            : [];

          await submitPullRequestReview(config, prNumber, {
            summary: String(params.summary ?? "").trim(),
            commitId,
            inlineComments,
          });

          return {
            content: [
              {
                type: "text",
                text: `Submitted review on pull request #${prNumber}${
                  inlineComments.length > 0 ? ` with ${inlineComments.length} inline comment(s).` : "."
                }`,
              },
            ],
            details: { prNumber, inlineCommentCount: inlineComments.length },
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }

  if (config.enabledTools.has("create_pull_request")) {
    pi.registerTool({
      name: "create_pull_request",
      label: "Create Pull Request",
      description: "Open a new pull request on GitHub from the current branch.",
      promptSnippet: "create_pull_request(title, body, head?, base?)",
      promptGuidelines: [
        "Use create_pull_request when the branch is ready for review on GitHub.",
        "Push the branch to GitHub first when the remote does not yet have the commits.",
      ],
      parameters: CreatePullRequestParams,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        try {
          const pull = await createPullRequest(config, ctx.cwd, {
            title: String(params.title ?? "").trim(),
            body: String(params.body ?? "").trim(),
            head: typeof params.head === "string" ? params.head.trim() : undefined,
            base: typeof params.base === "string" ? params.base.trim() : undefined,
          });
          return {
            content: [
              {
                type: "text",
                text: `Created pull request #${pull.number}: ${pull.title}\n${pull.url}`,
              },
            ],
            details: pull,
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }

  if (config.enabledTools.has("push_branch")) {
    pi.registerTool({
      name: "push_branch",
      label: "Push Branch to GitHub",
      description:
        "Save any uncommitted agent edits as a git commit, then upload the branch to GitHub.",
      promptSnippet: "push_branch(commit_message?, head_ref?)",
      promptGuidelines: [
        "Use push_branch after editing files locally when the changes should appear on GitHub.",
        "Prefer focused commit messages that describe the fix or feature.",
      ],
      parameters: PushBranchParams,
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        try {
          const result = await pushBranch(config, ctx.cwd, {
            commitMessage:
              typeof params.commit_message === "string" ? params.commit_message.trim() : undefined,
            headRef: typeof params.head_ref === "string" ? params.head_ref.trim() : undefined,
          });
          return {
            content: [
              {
                type: "text",
                text: result.committed
                  ? `Committed and pushed branch ${result.branch} to origin.`
                  : `Pushed branch ${result.branch} to origin.`,
              },
            ],
            details: result,
          };
        } catch (error) {
          return toolError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  }
}
