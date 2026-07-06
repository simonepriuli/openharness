import { Result } from "better-result";
import { OAuthError, TeamsApiError } from "../errors.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export type GraphTeam = { id: string; displayName: string };
export type GraphChannel = { id: string; displayName: string };

function mapTeamsCatch(cause: unknown, fallbackMessage: string): TeamsApiError {
  return TeamsApiError.is(cause)
    ? cause
    : new TeamsApiError({
        message: cause instanceof Error ? cause.message : fallbackMessage,
        cause,
      });
}

function graphFetch<T>(accessToken: string, path: string): Promise<Result<T, TeamsApiError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetch(`${GRAPH_BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new TeamsApiError({
          message: `Microsoft Graph error (${response.status}): ${text || response.statusText}`,
          status: response.status,
        });
      }
      return (await response.json()) as T;
    },
    catch: (cause) => mapTeamsCatch(cause, "Microsoft Graph request failed"),
  });
}

export async function listJoinedTeams(
  accessToken: string,
): Promise<Result<GraphTeam[], TeamsApiError>> {
  const dataResult = await graphFetch<{ value: GraphTeam[] }>(accessToken, "/me/joinedTeams");
  if (Result.isError(dataResult)) return Result.err(dataResult.error);
  return Result.ok(dataResult.value.value ?? []);
}

export async function listTeamChannels(
  accessToken: string,
  teamId: string,
): Promise<Result<GraphChannel[], TeamsApiError>> {
  const dataResult = await graphFetch<{ value: GraphChannel[] }>(
    accessToken,
    `/teams/${encodeURIComponent(teamId)}/channels`,
  );
  if (Result.isError(dataResult)) return Result.err(dataResult.error);
  return Result.ok(
    (dataResult.value.value ?? []).filter((channel) => channel.id && channel.displayName),
  );
}

export async function exchangeMicrosoftCode(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<
  Result<
    {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      tenant?: string;
    },
    TeamsApiError | OAuthError
  >
> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    grant_type: "authorization_code",
    code: options.code,
  });

  return Result.tryPromise({
    try: async () => {
      const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new OAuthError({
          message: `Microsoft token exchange failed (${response.status}): ${text}`,
        });
      }

      return (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        tenant?: string;
      };
    },
    catch: (cause) => {
      if (OAuthError.is(cause)) return cause;
      if (TeamsApiError.is(cause)) return cause;
      return new OAuthError({
        message: cause instanceof Error ? cause.message : "Microsoft token exchange failed",
        cause,
      });
    },
  });
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
