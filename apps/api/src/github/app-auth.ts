import { createSign } from "node:crypto";
import { Result } from "better-result";
import { GithubApiError } from "../errors.js";
import { env, githubAppPrivateKeyPem, hasGithubApp } from "../env.js";

const GITHUB_API = "https://api.github.com";

type InstallationTokenCache = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, InstallationTokenCache>();

function mapGithubCatch(cause: unknown, fallbackMessage: string): GithubApiError {
  return GithubApiError.is(cause)
    ? cause
    : new GithubApiError({
        message: cause instanceof Error ? cause.message : fallbackMessage,
        cause,
      });
}

function createAppJwt(): string {
  const appId = env.githubAppId();
  const privateKey = githubAppPrivateKeyPem();
  if (!appId || !privateKey) {
    throw new Error("GitHub App is not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${header}.${body}`;
  const sign = createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  const signature = sign.sign(privateKey, "base64url");
  return `${data}.${signature}`;
}

export async function getInstallationAccessToken(
  installationId: string,
): Promise<Result<string, GithubApiError>> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return Result.ok(cached.token);
  }

  return Result.tryPromise({
    try: async () => {
      const jwt = createAppJwt();
      const response = await fetch(
        `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new GithubApiError({
          message: `Failed to get installation token: ${response.status} ${text}`,
          status: response.status,
        });
      }

      const data = (await response.json()) as { token: string; expires_at: string };
      tokenCache.set(installationId, {
        token: data.token,
        expiresAt: new Date(data.expires_at).getTime(),
      });
      return data.token;
    },
    catch: (cause) => mapGithubCatch(cause, "Failed to get installation token"),
  });
}

export async function githubAppFetch(
  path: string,
  options: RequestInit & { installationId?: string } = {},
): Promise<Result<Response, GithubApiError>> {
  const { installationId, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");

  if (installationId) {
    const tokenResult = await getInstallationAccessToken(installationId);
    if (Result.isError(tokenResult)) return Result.err(tokenResult.error);
    headers.set("Authorization", `Bearer ${tokenResult.value}`);
  } else if (hasGithubApp()) {
    headers.set("Authorization", `Bearer ${createAppJwt()}`);
  }

  return Result.tryPromise({
    try: async () => fetch(`${GITHUB_API}${path}`, { ...init, headers }),
    catch: (cause) => mapGithubCatch(cause, "GitHub API request failed"),
  });
}

export function clearInstallationTokenCache(installationId?: string): void {
  if (installationId) {
    tokenCache.delete(installationId);
    return;
  }
  tokenCache.clear();
}
