const LINEAR_OAUTH_AUTHORIZE = "https://linear.app/oauth/authorize";
const LINEAR_OAUTH_TOKEN = "https://api.linear.app/oauth/token";

export type LinearTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
};

export type LinearViewer = {
  id: string;
  name: string;
  organization: { id: string; name: string };
};

const LINEAR_SCOPES = ["read", "write", "issues:create", "comments:create", "admin"].join(",");

export function buildLinearOAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: "code",
    scope: LINEAR_SCOPES,
    state: options.state,
    prompt: "consent",
    actor: "app",
  });
  return `${LINEAR_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeLinearCode(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<LinearTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    code: options.code,
  });

  const response = await fetch(LINEAR_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Linear token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as LinearTokenResponse;
}

export async function refreshLinearToken(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<LinearTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    refresh_token: options.refreshToken,
  });

  const response = await fetch(LINEAR_OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Linear token refresh failed (${response.status}): ${text}`);
  }

  return (await response.json()) as LinearTokenResponse;
}

export async function fetchLinearViewer(accessToken: string): Promise<LinearViewer> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query: `query Viewer {
        viewer {
          id
          name
          organization { id name }
        }
      }`,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Linear viewer query failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    data?: { viewer?: LinearViewer };
    errors?: Array<{ message: string }>;
  };

  if (data.errors?.length) {
    throw new Error(data.errors.map((entry) => entry.message).join("; "));
  }

  const viewer = data.data?.viewer;
  if (!viewer?.organization?.id) {
    throw new Error("Linear viewer response did not include organization.");
  }

  return viewer;
}
