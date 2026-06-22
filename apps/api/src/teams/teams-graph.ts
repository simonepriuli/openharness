const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type GraphTeam = { id: string; displayName: string };
export type GraphChannel = { id: string; displayName: string };

async function graphFetch<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Microsoft Graph error (${response.status}): ${text || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function listJoinedTeams(accessToken: string): Promise<GraphTeam[]> {
  const data = await graphFetch<{ value: GraphTeam[] }>(accessToken, "/me/joinedTeams");
  return data.value ?? [];
}

export async function listTeamChannels(
  accessToken: string,
  teamId: string,
): Promise<GraphChannel[]> {
  const data = await graphFetch<{ value: GraphChannel[] }>(
    accessToken,
    `/teams/${encodeURIComponent(teamId)}/channels`,
  );
  return (data.value ?? []).filter((channel) => channel.id && channel.displayName);
}

export async function exchangeMicrosoftCode(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  tenant?: string;
}> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    grant_type: "authorization_code",
    code: options.code,
  });

  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Microsoft token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    tenant?: string;
  };
}

export function buildMicrosoftOAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: "code",
    redirect_uri: options.redirectUri,
    response_mode: "query",
    scope: [
      "offline_access",
      "Team.ReadBasic.All",
      "Channel.ReadBasic.All",
      "User.Read",
    ].join(" "),
    state: options.state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}
