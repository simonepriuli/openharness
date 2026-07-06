import type { Database } from "@openharness/db";
import { Result } from "better-result";
import { env, hasLinearOAuth } from "../env.js";
import { ValidationError } from "../errors.js";
import {
  getLinearInstallationForOrg,
  getLinearInstallationWithTokens,
  updateLinearInstallationTokens,
} from "./linear-db.js";
import { refreshLinearToken } from "./linear-oauth.js";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getValidLinearAccessToken(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const installation = await getLinearInstallationWithTokens(db, organizationId);
  if (!installation) return null;

  const expiresAt = installation.tokenExpiresAt?.getTime();
  const needsRefresh =
    expiresAt !== undefined &&
    expiresAt !== null &&
    expiresAt - Date.now() < TOKEN_REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return installation.accessToken;
  }

  if (!installation.refreshToken || !hasLinearOAuth()) {
    return installation.accessToken;
  }

  const token = await refreshLinearToken({
    clientId: env.linearClientId()!,
    clientSecret: env.linearClientSecret()!,
    refreshToken: installation.refreshToken,
  });

  await updateLinearInstallationTokens(db, installation.id, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? installation.refreshToken,
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null,
  });

  return token.access_token;
}

export async function requireLinearConnected(
  db: Database,
  organizationId: string,
): Promise<Result<{ accessToken: string; installationId: string }, ValidationError>> {
  const installation = await getLinearInstallationForOrg(db, organizationId);
  if (!installation) {
    return Result.err(
      new ValidationError({ message: "Linear is not connected for this organization." }),
    );
  }

  const accessToken = await getValidLinearAccessToken(db, organizationId);
  if (!accessToken) {
    return Result.err(
      new ValidationError({ message: "Linear is not connected for this organization." }),
    );
  }

  return Result.ok({ accessToken, installationId: installation.id });
}
