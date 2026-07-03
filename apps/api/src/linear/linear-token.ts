import type { Database } from "@openharness/db";
import { env, hasLinearOAuth } from "../env.js";
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
): Promise<{ accessToken: string; installationId: string }> {
  const installation = await getLinearInstallationForOrg(db, organizationId);
  if (!installation) {
    throw new Error("Linear is not connected for this organization.");
  }

  const accessToken = await getValidLinearAccessToken(db, organizationId);
  if (!accessToken) {
    throw new Error("Linear is not connected for this organization.");
  }

  return { accessToken, installationId: installation.id };
}
