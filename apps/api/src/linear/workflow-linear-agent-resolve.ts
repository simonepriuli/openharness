import { Result } from "better-result";

export async function resolveProjectIdFromIssue(
  accessToken: string,
  issueId: string,
): Promise<string | null> {
  const { getLinearIssue } = await import("./linear-client.js");
  const issueResult = await getLinearIssue(accessToken, issueId);
  if (Result.isError(issueResult)) return null;
  return issueResult.value?.project?.id ?? null;
}
