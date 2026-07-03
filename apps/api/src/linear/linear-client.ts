const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function linearGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
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
    throw new Error(`Linear GraphQL request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as GraphQLResponse<T>;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((entry) => entry.message).join("; "));
  }
  if (!payload.data) {
    throw new Error("Linear GraphQL response did not include data.");
  }
  return payload.data;
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
): Promise<{ id: string; secret: string | null }> {
  const data = await linearGraphQL<{
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

  if (!data.webhookCreate.success || !data.webhookCreate.webhook?.id) {
    throw new Error("Failed to create Linear webhook.");
  }

  return {
    id: data.webhookCreate.webhook.id,
    secret: data.webhookCreate.webhook.secret ?? null,
  };
}

export async function deleteLinearWebhook(accessToken: string, webhookId: string): Promise<void> {
  await linearGraphQL<{ webhookDelete: { success: boolean } }>(
    accessToken,
    `mutation DeleteWebhook($id: String!) {
      webhookDelete(id: $id) { success }
    }`,
    { id: webhookId },
  );
}

export async function listLinearProjects(accessToken: string): Promise<LinearProject[]> {
  const data = await linearGraphQL<{
    projects: { nodes: LinearProject[] };
  }>(
    accessToken,
    `query Projects {
      projects(first: 100) {
        nodes { id name slugId }
      }
    }`,
  );
  return data.projects.nodes;
}

export async function listLinearTeams(accessToken: string): Promise<LinearTeam[]> {
  const data = await linearGraphQL<{
    teams: { nodes: LinearTeam[] };
  }>(
    accessToken,
    `query Teams {
      teams(first: 100) {
        nodes { id name key }
      }
    }`,
  );
  return data.teams.nodes;
}

export async function listLinearLabels(
  accessToken: string,
  teamId?: string,
): Promise<LinearLabel[]> {
  const data = await linearGraphQL<{
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
  return data.issueLabels.nodes;
}

export async function listLinearCycles(
  accessToken: string,
  teamId?: string,
): Promise<LinearCycle[]> {
  const data = await linearGraphQL<{
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
  return data.cycles.nodes;
}

export async function searchLinearIssues(
  accessToken: string,
  options: { query?: string; teamId?: string; projectId?: string; limit?: number },
): Promise<LinearIssue[]> {
  const filter: Record<string, unknown> = {};
  if (options.teamId) filter.team = { id: { eq: options.teamId } };
  if (options.projectId) filter.project = { id: { eq: options.projectId } };

  const data = await linearGraphQL<{
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
  return issues;
}

export async function getLinearIssue(
  accessToken: string,
  issueId: string,
): Promise<LinearIssue | null> {
  const data = await linearGraphQL<{ issue: LinearIssue | null }>(
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
  return data.issue;
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
): Promise<LinearIssue> {
  const data = await linearGraphQL<{
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

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error("Failed to create Linear issue.");
  }
  return data.issueCreate.issue;
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
): Promise<LinearIssue> {
  const data = await linearGraphQL<{
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

  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    throw new Error("Failed to update Linear issue.");
  }
  return data.issueUpdate.issue;
}

export async function assignLinearIssue(
  accessToken: string,
  issueId: string,
  assigneeId: string | null,
): Promise<LinearIssue> {
  const data = await linearGraphQL<{
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

  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    throw new Error("Failed to assign Linear issue.");
  }
  return data.issueUpdate.issue;
}

export async function updateLinearIssueStatus(
  accessToken: string,
  issueId: string,
  stateId: string,
): Promise<LinearIssue> {
  const data = await linearGraphQL<{
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

  if (!data.issueUpdate.success || !data.issueUpdate.issue) {
    throw new Error("Failed to update Linear issue status.");
  }
  return data.issueUpdate.issue;
}

export async function linkLinearIssue(
  accessToken: string,
  issueId: string,
  url: string,
  title?: string,
): Promise<{ id: string; url: string }> {
  const data = await linearGraphQL<{
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

  if (!data.attachmentLinkURL.success || !data.attachmentLinkURL.attachment) {
    throw new Error("Failed to link URL to Linear issue.");
  }
  return data.attachmentLinkURL.attachment;
}

export async function listLinearComments(
  accessToken: string,
  issueId: string,
): Promise<LinearComment[]> {
  const data = await linearGraphQL<{
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
  return data.issue?.comments.nodes ?? [];
}

export async function createLinearComment(
  accessToken: string,
  issueId: string,
  body: string,
): Promise<LinearComment> {
  const data = await linearGraphQL<{
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

  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new Error("Failed to create Linear comment.");
  }
  return data.commentCreate.comment;
}

export async function getLinearIssueByIdentifier(
  accessToken: string,
  identifier: string,
): Promise<LinearIssue | null> {
  const issues = await searchLinearIssues(accessToken, { query: identifier, limit: 10 });
  const normalized = identifier.trim().toUpperCase();
  return issues.find((issue) => issue.identifier.toUpperCase() === normalized) ?? null;
}
