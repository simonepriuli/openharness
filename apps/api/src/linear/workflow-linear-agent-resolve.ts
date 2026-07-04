export async function resolveProjectIdFromIssue(
  accessToken: string,
  issueId: string,
): Promise<string | null> {
  const { getLinearIssue } = await import("./linear-client.js");
  const issue = await getLinearIssue(accessToken, issueId);
  return issue?.project?.id ?? null;
}
