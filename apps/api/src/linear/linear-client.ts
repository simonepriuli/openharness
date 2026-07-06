import { Result } from "better-result";
import { LinearApiError } from "../errors.js";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

function mapLinearCatch(cause: unknown, fallbackMessage: string): LinearApiError {
  return LinearApiError.is(cause)
    ? cause
    : new LinearApiError({
        message: cause instanceof Error ? cause.message : fallbackMessage,
        cause,
      });
}

function requireLinearMutationSuccess<T>(
  success: boolean,
  value: T | null | undefined,
  message: string,
): Result<T, LinearApiError> {
  if (!success || value == null) {
    return Result.err(new LinearApiError({ message }));
  }
  return Result.ok(value);
}

function mapLinearGraphQL<T, U>(
  accessToken: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  map: (data: T) => Result<U, LinearApiError>,
): Promise<Result<U, LinearApiError>> {
  return linearGraphQL<T>(accessToken, query, variables).then((dataResult) => {
    if (Result.isError(dataResult)) return dataResult;
    return map(dataResult.value);
  });
}

function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<Result<T, LinearApiError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetch(LINEAR_GRAPHQL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new LinearApiError({
          message: `Linear GraphQL request failed (${response.status}): ${text}`,
        });
      }

      const payload = (await response.json()) as GraphQLResponse<T>;
      if (payload.errors?.length) {
        throw new LinearApiError({
          message: payload.errors.map((entry) => entry.message).join("; "),
        });
      }
      if (!payload.data) {
        throw new LinearApiError({ message: "Linear GraphQL response did not include data." });
      }
      return payload.data;
    },
    catch: (cause) => mapLinearCatch(cause, "Linear GraphQL request failed"),
  });
}

export type LinearProject = { id: string; name: string; slugId?: string };
export type LinearTeam = { id: string; name: string; key: string };
export type LinearLabel = { id: string; name: string; color?: string };
export type LinearCycle = { id: string; name: string; number: number };
export type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description?: string | null;
  url: string;
  priority?: number;
  state?: { id: string; name: string } | null;
  assignee?: { id: string; name: string } | null;
  team?: { id: string; name: string; key: string } | null;
  project?: { id: string; name: string } | null;
  labels?: { nodes: Array<{ id: string; name: string }> };
};
export type LinearComment = {
  id: string;
  body: string;
  createdAt: string;
  user?: { id: string; name: string } | null;
};

export async function createLinearWebhook(
  accessToken: string,
  webhookUrl: string,
): Promise<Result<{ id: string; secret: string | null }, LinearApiError>> {
  return mapLinearGraphQL<
    {
      webhookCreate: {
        success: boolean;
        webhook?: { id: string; secret?: string | null };
      };
    },
    { id: string; secret: string | null }
  >(
    accessToken,
    `mutation CreateWebhook($url: String!) {
      webhookCreate(
        input: {
          url: $url
          allPublicTeams: true
          resourceTypes: [Issue, Comment]
        }
      ) {
        success
        webhook { id secret }
      }
    }`,
    { url: webhookUrl },
    (data) => {
      const webhook = requireLinearMutationSuccess(
        data.webhookCreate.success,
        data.webhookCreate.webhook,
        "Failed to create Linear webhook.",
      );
      if (Result.isError(webhook)) return webhook;
      return Result.ok({
        id: webhook.value.id,
        secret: webhook.value.secret ?? null,
      });
    },
  );
}

export async function deleteLinearWebhook(
  accessToken: string,
  webhookId: string,
): Promise<Result<void, LinearApiError>> {
  return mapLinearGraphQL<{ webhookDelete: { success: boolean } }, void>(
    accessToken,
    `mutation DeleteWebhook($id: String!) {
      webhookDelete(id: $id) { success }
    }`,
    { id: webhookId },
    (data) =>
      data.webhookDelete.success
        ? Result.ok(undefined)
        : Result.err(new LinearApiError({ message: "Failed to delete Linear webhook." })),
  );
}

export async function listLinearProjects(
  accessToken: string,
): Promise<Result<LinearProject[], LinearApiError>> {
  return mapLinearGraphQL<{ projects: { nodes: LinearProject[] } }, LinearProject[]>(
    accessToken,
    `query Projects {
      projects(first: 100) {
        nodes { id name slugId }
      }
    }`,
    undefined,
    (data) => Result.ok(data.projects.nodes),
  );
}

export async function listLinearTeams(
  accessToken: string,
): Promise<Result<LinearTeam[], LinearApiError>> {
  return mapLinearGraphQL<{ teams: { nodes: LinearTeam[] } }, LinearTeam[]>(
    accessToken,
    `query Teams {
      teams(first: 100) {
        nodes { id name key }
      }
    }`,
    undefined,
    (data) => Result.ok(data.teams.nodes),
  );
}

export async function listLinearLabels(
  accessToken: string,
  teamId?: string,
): Promise<Result<LinearLabel[], LinearApiError>> {
  return mapLinearGraphQL<{ issueLabels: { nodes: LinearLabel[] } }, LinearLabel[]>(
    accessToken,
    `query Labels($teamId: String) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }, first: 100) {
        nodes { id name color }
      }
    }`,
    teamId ? { teamId } : { teamId: null },
    (data) => Result.ok(data.issueLabels.nodes),
  );
}

export async function listLinearCycles(
  accessToken: string,
  teamId?: string,
): Promise<Result<LinearCycle[], LinearApiError>> {
  return mapLinearGraphQL<{ cycles: { nodes: LinearCycle[] } }, LinearCycle[]>(
    accessToken,
    `query Cycles($teamId: ID) {
      cycles(filter: { team: { id: { eq: $teamId } } }, first: 50) {
        nodes { id name number }
      }
    }`,
    teamId ? { teamId } : {},
    (data) => Result.ok(data.cycles.nodes),
  );
}

export async function searchLinearIssues(
  accessToken: string,
  options: { query?: string; teamId?: string; projectId?: string; limit?: number },
): Promise<Result<LinearIssue[], LinearApiError>> {
  const filter: Record<string, unknown> = {};
  if (options.teamId) filter.team = { id: { eq: options.teamId } };
  if (options.projectId) filter.project = { id: { eq: options.projectId } };

  return mapLinearGraphQL<{ issues: { nodes: LinearIssue[] } }, LinearIssue[]>(
    accessToken,
    `query SearchIssues($filter: IssueFilter, $first: Int) {
      issues(filter: $filter, first: $first) {
        nodes {
          id identifier title description url priority
          state { id name }
          assignee { id name }
          team { id name key }
          project { id name }
          labels { nodes { id name } }
        }
      }
    }`,
    { filter: Object.keys(filter).length > 0 ? filter : undefined, first: options.limit ?? 25 },
    (data) => {
      let issues = data.issues.nodes;
      if (options.query?.trim()) {
        const needle = options.query.trim().toLowerCase();
        issues = issues.filter(
          (issue) =>
            issue.title.toLowerCase().includes(needle) ||
            issue.identifier.toLowerCase().includes(needle) ||
            (issue.description ?? "").toLowerCase().includes(needle),
        );
      }
      return Result.ok(issues);
    },
  );
}

export async function getLinearIssue(
  accessToken: string,
  issueId: string,
): Promise<Result<LinearIssue | null, LinearApiError>> {
  return mapLinearGraphQL<{ issue: LinearIssue | null }, LinearIssue | null>(
    accessToken,
    `query Issue($id: String!) {
      issue(id: $id) {
        id identifier title description url priority
        state { id name }
        assignee { id name }
        team { id name key }
        project { id name }
        labels { nodes { id name } }
      }
    }`,
    { id: issueId },
    (data) => Result.ok(data.issue),
  );
}

type LinearIssueCreatePayload = {
  issueCreate: { success: boolean; issue?: LinearIssue };
};

type LinearIssueUpdatePayload = {
  issueUpdate: { success: boolean; issue?: LinearIssue };
};

function mapLinearIssueCreate(
  data: LinearIssueCreatePayload,
  failureMessage: string,
): Result<LinearIssue, LinearApiError> {
  return requireLinearMutationSuccess(
    data.issueCreate.success,
    data.issueCreate.issue,
    failureMessage,
  );
}

function mapLinearIssueUpdate(
  data: LinearIssueUpdatePayload,
  failureMessage: string,
): Result<LinearIssue, LinearApiError> {
  return requireLinearMutationSuccess(
    data.issueUpdate.success,
    data.issueUpdate.issue,
    failureMessage,
  );
}

export async function createLinearIssue(
  accessToken: string,
  input: {
    teamId: string;
    title: string;
    description?: string;
    projectId?: string;
    priority?: number;
    labelIds?: string[];
    assigneeId?: string;
  },
): Promise<Result<LinearIssue, LinearApiError>> {
  return mapLinearGraphQL<LinearIssueCreatePayload, LinearIssue>(
    accessToken,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id identifier title description url priority
          state { id name }
          assignee { id name }
          team { id name key }
          project { id name }
        }
      }
    }`,
    {
      input: {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        projectId: input.projectId,
        priority: input.priority,
        labelIds: input.labelIds,
        assigneeId: input.assigneeId,
      },
    },
    (data) => mapLinearIssueCreate(data, "Failed to create Linear issue."),
  );
}

export async function updateLinearIssue(
  accessToken: string,
  issueId: string,
  input: {
    title?: string;
    description?: string;
    priority?: number;
    projectId?: string;
    labelIds?: string[];
  },
): Promise<Result<LinearIssue, LinearApiError>> {
  return mapLinearGraphQL<LinearIssueUpdatePayload, LinearIssue>(
    accessToken,
    `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue {
          id identifier title description url priority
          state { id name }
          assignee { id name }
          team { id name key }
          project { id name }
        }
      }
    }`,
    { id: issueId, input },
    (data) => mapLinearIssueUpdate(data, "Failed to update Linear issue."),
  );
}

export async function assignLinearIssue(
  accessToken: string,
  issueId: string,
  assigneeId: string | null,
): Promise<Result<LinearIssue, LinearApiError>> {
  return mapLinearGraphQL<LinearIssueUpdatePayload, LinearIssue>(
    accessToken,
    `mutation AssignIssue($id: String!, $assigneeId: String) {
      issueUpdate(id: $id, input: { assigneeId: $assigneeId }) {
        success
        issue {
          id identifier title description url priority
          state { id name }
          assignee { id name }
          team { id name key }
          project { id name }
        }
      }
    }`,
    { id: issueId, assigneeId },
    (data) => mapLinearIssueUpdate(data, "Failed to assign Linear issue."),
  );
}

export async function updateLinearIssueStatus(
  accessToken: string,
  issueId: string,
  stateId: string,
): Promise<Result<LinearIssue, LinearApiError>> {
  return mapLinearGraphQL<LinearIssueUpdatePayload, LinearIssue>(
    accessToken,
    `mutation UpdateIssueStatus($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue {
          id identifier title description url priority
          state { id name }
          assignee { id name }
          team { id name key }
          project { id name }
        }
      }
    }`,
    { id: issueId, stateId },
    (data) => mapLinearIssueUpdate(data, "Failed to update Linear issue status."),
  );
}

export async function linkLinearIssue(
  accessToken: string,
  issueId: string,
  url: string,
  title?: string,
): Promise<Result<{ id: string; url: string }, LinearApiError>> {
  return mapLinearGraphQL<
    {
      attachmentLinkURL: { success: boolean; attachment?: { id: string; url: string } };
    },
    { id: string; url: string }
  >(
    accessToken,
    `mutation LinkIssue($issueId: String!, $url: String!, $title: String) {
      attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
        success
        attachment { id url }
      }
    }`,
    { issueId, url, title },
    (data) =>
      requireLinearMutationSuccess(
        data.attachmentLinkURL.success,
        data.attachmentLinkURL.attachment,
        "Failed to link URL to Linear issue.",
      ),
  );
}

export async function listLinearComments(
  accessToken: string,
  issueId: string,
): Promise<Result<LinearComment[], LinearApiError>> {
  return mapLinearGraphQL<
    { issue: { comments: { nodes: LinearComment[] } } | null },
    LinearComment[]
  >(
    accessToken,
    `query IssueComments($id: String!) {
      issue(id: $id) {
        comments(first: 50) {
          nodes { id body createdAt user { id name } }
        }
      }
    }`,
    { id: issueId },
    (data) => Result.ok(data.issue?.comments.nodes ?? []),
  );
}

export async function createLinearComment(
  accessToken: string,
  issueId: string,
  body: string,
): Promise<Result<LinearComment, LinearApiError>> {
  return mapLinearGraphQL<
    { commentCreate: { success: boolean; comment?: LinearComment } },
    LinearComment
  >(
    accessToken,
    `mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt user { id name } }
      }
    }`,
    { input: { issueId, body } },
    (data) =>
      requireLinearMutationSuccess(
        data.commentCreate.success,
        data.commentCreate.comment,
        "Failed to create Linear comment.",
      ),
  );
}

export async function getLinearIssueByIdentifier(
  accessToken: string,
  identifier: string,
): Promise<Result<LinearIssue | null, LinearApiError>> {
  const issuesResult = await searchLinearIssues(accessToken, { query: identifier, limit: 10 });
  return Result.andThen(issuesResult, (issues) => {
    const normalized = identifier.trim().toUpperCase();
    return Result.ok(
      issues.find((issue) => issue.identifier.toUpperCase() === normalized) ?? null,
    );
  });
}

export type LinearAgentActivityContent =
  | { type: "thought"; body: string }
  | { type: "action"; action: string; parameter?: string; result?: string }
  | { type: "response"; body: string }
  | { type: "error"; body: string };

export async function createLinearAgentActivity(
  accessToken: string,
  input: {
    agentSessionId: string;
    content: LinearAgentActivityContent;
    ephemeral?: boolean;
  },
): Promise<Result<void, LinearApiError>> {
  return mapLinearGraphQL<{ agentActivityCreate: { success: boolean } }, void>(
    accessToken,
    `mutation AgentActivityCreate($input: AgentActivityCreateInput!) {
      agentActivityCreate(input: $input) {
        success
      }
    }`,
    {
      input: {
        agentSessionId: input.agentSessionId,
        content: input.content,
        ephemeral: input.ephemeral ?? false,
      },
    },
    (data) =>
      data.agentActivityCreate.success
        ? Result.ok(undefined)
        : Result.err(new LinearApiError({ message: "Failed to create Linear agent activity." })),
  );
}

export async function updateLinearAgentSession(
  accessToken: string,
  input: {
    agentSessionId: string;
    externalUrls?: Array<{ label: string; url: string }>;
  },
): Promise<Result<void, LinearApiError>> {
  return mapLinearGraphQL<{ agentSessionUpdate: { success: boolean } }, void>(
    accessToken,
    `mutation AgentSessionUpdate($id: String!, $input: AgentSessionUpdateInput!) {
      agentSessionUpdate(id: $id, input: $input) {
        success
      }
    }`,
    {
      id: input.agentSessionId,
      input: {
        ...(input.externalUrls?.length ? { externalUrls: input.externalUrls } : {}),
      },
    },
    (data) =>
      data.agentSessionUpdate.success
        ? Result.ok(undefined)
        : Result.err(new LinearApiError({ message: "Failed to update Linear agent session." })),
  );
}
