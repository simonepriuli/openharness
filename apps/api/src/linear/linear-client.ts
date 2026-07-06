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
  const dataResult = await linearGraphQL<{
    webhookCreate: {
      success: boolean;
      webhook?: { id: string; secret?: string | null };
    };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.webhookCreate.success || !data.webhookCreate.webhook?.id) {
    return Result.err(new LinearApiError({ message: "Failed to create Linear webhook." }));
  }

  return Result.ok({
    id: data.webhookCreate.webhook.id,
    secret: data.webhookCreate.webhook.secret ?? null,
  });
}

export async function deleteLinearWebhook(
  accessToken: string,
  webhookId: string,
): Promise<Result<void, LinearApiError>> {
  const dataResult = await linearGraphQL<{ webhookDelete: { success: boolean } }>(
    accessToken,
    `mutation DeleteWebhook($id: String!) {
      webhookDelete(id: $id) { success }
    }`,
    { id: webhookId },
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(undefined);
}

export async function listLinearProjects(
  accessToken: string,
): Promise<Result<LinearProject[], LinearApiError>> {
  const dataResult = await linearGraphQL<{
    projects: { nodes: LinearProject[] };
  }>(
    accessToken,
    `query Projects {
      projects(first: 100) {
        nodes { id name slugId }
      }
    }`,
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.projects.nodes);
}

export async function listLinearTeams(
  accessToken: string,
): Promise<Result<LinearTeam[], LinearApiError>> {
  const dataResult = await linearGraphQL<{
    teams: { nodes: LinearTeam[] };
  }>(
    accessToken,
    `query Teams {
      teams(first: 100) {
        nodes { id name key }
      }
    }`,
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.teams.nodes);
}

export async function listLinearLabels(
  accessToken: string,
  teamId?: string,
): Promise<Result<LinearLabel[], LinearApiError>> {
  const dataResult = await linearGraphQL<{
    issueLabels: { nodes: LinearLabel[] };
  }>(
    accessToken,
    `query Labels($teamId: String) {
      issueLabels(filter: { team: { id: { eq: $teamId } } }, first: 100) {
        nodes { id name color }
      }
    }`,
    teamId ? { teamId } : { teamId: null },
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.issueLabels.nodes);
}

export async function listLinearCycles(
  accessToken: string,
  teamId?: string,
): Promise<Result<LinearCycle[], LinearApiError>> {
  const dataResult = await linearGraphQL<{
    cycles: { nodes: LinearCycle[] };
  }>(
    accessToken,
    `query Cycles($teamId: ID) {
      cycles(filter: { team: { id: { eq: $teamId } } }, first: 50) {
        nodes { id name number }
      }
    }`,
    teamId ? { teamId } : {},
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.cycles.nodes);
}

export async function searchLinearIssues(
  accessToken: string,
  options: { query?: string; teamId?: string; projectId?: string; limit?: number },
): Promise<Result<LinearIssue[], LinearApiError>> {
  const filter: Record<string, unknown> = {};
  if (options.teamId) filter.team = { id: { eq: options.teamId } };
  if (options.projectId) filter.project = { id: { eq: options.projectId } };

  const dataResult = await linearGraphQL<{
    issues: { nodes: LinearIssue[] };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  let issues = dataResult.value.issues.nodes;
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
}

export async function getLinearIssue(
  accessToken: string,
  issueId: string,
): Promise<Result<LinearIssue | null, LinearApiError>> {
  const dataResult = await linearGraphQL<{ issue: LinearIssue | null }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.issue);
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
  const dataResult = await linearGraphQL<{
    issueCreate: { success: boolean; issue?: LinearIssue };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    return Result.err(new LinearApiError({ message: "Failed to create Linear issue." }));
  }
  return Result.ok(data.issueCreate.issue);
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
  const dataResult = await linearGraphQL<{
    issueUpdate: { success: boolean; issue?: LinearIssue };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    return Result.err(new LinearApiError({ message: "Failed to update Linear issue." }));
  }
  return Result.ok(data.issueUpdate.issue);
}

export async function assignLinearIssue(
  accessToken: string,
  issueId: string,
  assigneeId: string | null,
): Promise<Result<LinearIssue, LinearApiError>> {
  const dataResult = await linearGraphQL<{
    issueUpdate: { success: boolean; issue?: LinearIssue };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    return Result.err(new LinearApiError({ message: "Failed to assign Linear issue." }));
  }
  return Result.ok(data.issueUpdate.issue);
}

export async function updateLinearIssueStatus(
  accessToken: string,
  issueId: string,
  stateId: string,
): Promise<Result<LinearIssue, LinearApiError>> {
  const dataResult = await linearGraphQL<{
    issueUpdate: { success: boolean; issue?: LinearIssue };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    return Result.err(new LinearApiError({ message: "Failed to update Linear issue status." }));
  }
  return Result.ok(data.issueUpdate.issue);
}

export async function linkLinearIssue(
  accessToken: string,
  issueId: string,
  url: string,
  title?: string,
): Promise<Result<{ id: string; url: string }, LinearApiError>> {
  const dataResult = await linearGraphQL<{
    attachmentLinkURL: { success: boolean; attachment?: { id: string; url: string } };
  }>(
    accessToken,
    `mutation LinkIssue($issueId: String!, $url: String!, $title: String) {
      attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
        success
        attachment { id url }
      }
    }`,
    { issueId, url, title },
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.attachmentLinkURL.success || !data.attachmentLinkURL.attachment) {
    return Result.err(new LinearApiError({ message: "Failed to link URL to Linear issue." }));
  }
  return Result.ok(data.attachmentLinkURL.attachment);
}

export async function listLinearComments(
  accessToken: string,
  issueId: string,
): Promise<Result<LinearComment[], LinearApiError>> {
  const dataResult = await linearGraphQL<{
    issue: { comments: { nodes: LinearComment[] } } | null;
  }>(
    accessToken,
    `query IssueComments($id: String!) {
      issue(id: $id) {
        comments(first: 50) {
          nodes { id body createdAt user { id name } }
        }
      }
    }`,
    { id: issueId },
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.issue?.comments.nodes ?? []);
}

export async function createLinearComment(
  accessToken: string,
  issueId: string,
  body: string,
): Promise<Result<LinearComment, LinearApiError>> {
  const dataResult = await linearGraphQL<{
    commentCreate: { success: boolean; comment?: LinearComment };
  }>(
    accessToken,
    `mutation CreateComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt user { id name } }
      }
    }`,
    { input: { issueId, body } },
  );
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.commentCreate.success || !data.commentCreate.comment) {
    return Result.err(new LinearApiError({ message: "Failed to create Linear comment." }));
  }
  return Result.ok(data.commentCreate.comment);
}

export async function getLinearIssueByIdentifier(
  accessToken: string,
  identifier: string,
): Promise<Result<LinearIssue | null, LinearApiError>> {
  const issuesResult = await searchLinearIssues(accessToken, { query: identifier, limit: 10 });
  if (Result.isError(issuesResult)) return issuesResult;
  const normalized = identifier.trim().toUpperCase();
  return Result.ok(
    issuesResult.value.find((issue) => issue.identifier.toUpperCase() === normalized) ?? null,
  );
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
  const dataResult = await linearGraphQL<{
    agentActivityCreate: { success: boolean };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  if (!dataResult.value.agentActivityCreate.success) {
    return Result.err(new LinearApiError({ message: "Failed to create Linear agent activity." }));
  }
  return Result.ok(undefined);
}

export async function updateLinearAgentSession(
  accessToken: string,
  input: {
    agentSessionId: string;
    externalUrls?: Array<{ label: string; url: string }>;
  },
): Promise<Result<void, LinearApiError>> {
  const dataResult = await linearGraphQL<{
    agentSessionUpdate: { success: boolean };
  }>(
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
  );
  if (Result.isError(dataResult)) return dataResult;

  if (!dataResult.value.agentSessionUpdate.success) {
    return Result.err(new LinearApiError({ message: "Failed to update Linear agent session." }));
  }
  return Result.ok(undefined);
}
