function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

const DEFAULT_ELECTRON_AUTH_SCHEME = "com.openharness.desktop";

export function electronAuthScheme(): string {
  return optionalEnv("ELECTRON_AUTH_SCHEME") ?? DEFAULT_ELECTRON_AUTH_SCHEME;
}

function parseOrigins(value: string | undefined, fallback: string): string[] {
  const raw = value ?? fallback;
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function withElectronTrustedOrigin(origins: string[]): string[] {
  const scheme = electronAuthScheme();
  const electronOrigin = `${scheme}:/`;
  if (origins.includes(electronOrigin)) {
    return origins;
  }
  return [...origins, electronOrigin];
}

export const env = {
  databaseUrl: () => requiredEnv("DATABASE_URL"),
  betterAuthSecret: () => requiredEnv("BETTER_AUTH_SECRET"),
  betterAuthUrl: () => requiredEnv("BETTER_AUTH_URL"),
  trustedOrigins: () =>
    withElectronTrustedOrigin(
      parseOrigins(optionalEnv("TRUSTED_ORIGINS"), requiredEnv("BETTER_AUTH_URL")),
    ),
  githubClientId: () => optionalEnv("GITHUB_CLIENT_ID"),
  githubClientSecret: () => optionalEnv("GITHUB_CLIENT_SECRET"),
  githubAppId: () => optionalEnv("GITHUB_APP_ID"),
  githubAppPrivateKey: () => optionalEnv("GITHUB_APP_PRIVATE_KEY"),
  githubAppWebhookSecret: () => optionalEnv("GITHUB_APP_WEBHOOK_SECRET"),
  githubAppSlug: () => optionalEnv("GITHUB_APP_SLUG"),
  cronSecret: () => optionalEnv("CRON_SECRET"),
  teamsBotAppId: () => optionalEnv("TEAMS_BOT_APP_ID"),
  teamsBotAppSecret: () => optionalEnv("TEAMS_BOT_APP_SECRET"),
  teamsBotTenantId: () => optionalEnv("TEAMS_BOT_TENANT_ID"),
  microsoftClientId: () => optionalEnv("MICROSOFT_CLIENT_ID"),
  microsoftClientSecret: () => optionalEnv("MICROSOFT_CLIENT_SECRET"),
  microsoftOAuthRedirectUri: () => optionalEnv("MICROSOFT_OAUTH_REDIRECT_URI"),
  discordClientId: () => optionalEnv("DISCORD_CLIENT_ID"),
  discordClientSecret: () => optionalEnv("DISCORD_CLIENT_SECRET"),
  discordOAuthRedirectUri: () => optionalEnv("DISCORD_OAUTH_REDIRECT_URI"),
  discordBotToken: () => optionalEnv("DISCORD_BOT_TOKEN"),
  discordPublicKey: () => optionalEnv("DISCORD_PUBLIC_KEY"),
  linearClientId: () => optionalEnv("LINEAR_CLIENT_ID"),
  linearClientSecret: () => optionalEnv("LINEAR_CLIENT_SECRET"),
  linearOAuthRedirectUri: () => optionalEnv("LINEAR_OAUTH_REDIRECT_URI"),
  linearWebhookSecret: () => optionalEnv("LINEAR_WEBHOOK_SECRET"),
  orgSecretsEncryptionKey: () => optionalEnv("ORG_SECRETS_ENCRYPTION_KEY"),
  cloudWorkerSecret: () => optionalEnv("CLOUD_WORKER_SECRET"),
  cloudWorkerSnapshotId: () => optionalEnv("CLOUD_WORKER_SNAPSHOT_ID"),
  cloudWorkerBundleFingerprint: () => optionalEnv("CLOUD_WORKER_BUNDLE_FINGERPRINT"),
  /** Idle TTL for issue-scoped Linear agent sandboxes (default 45 min, clamped 30–120). */
  linearAgentIssueWorkspaceIdleTtlMs: () => {
    const raw = optionalEnv("LINEAR_AGENT_ISSUE_WORKSPACE_IDLE_TTL_MINUTES");
    if (!raw) return 45 * 60 * 1000;
    const minutes = Number.parseInt(raw, 10);
    if (!Number.isFinite(minutes) || minutes < 30 || minutes > 120) {
      return 45 * 60 * 1000;
    }
    return minutes * 60 * 1000;
  },
};

export function hasTeamsBot(): boolean {
  return Boolean(env.teamsBotAppId() && env.teamsBotAppSecret());
}

export function hasMicrosoftOAuth(): boolean {
  return Boolean(
    env.microsoftClientId() &&
      env.microsoftClientSecret() &&
      env.microsoftOAuthRedirectUri(),
  );
}

export function hasDiscordOAuth(): boolean {
  return Boolean(
    env.discordClientId() &&
      env.discordClientSecret() &&
      env.discordOAuthRedirectUri(),
  );
}

export function hasDiscordBot(): boolean {
  return Boolean(env.discordBotToken() && env.discordPublicKey());
}

export function hasLinearOAuth(): boolean {
  return Boolean(
    env.linearClientId() &&
      env.linearClientSecret() &&
      env.linearOAuthRedirectUri(),
  );
}

export function hasGithubOAuth(): boolean {
  return Boolean(env.githubClientId() && env.githubClientSecret());
}

export function hasGithubApp(): boolean {
  return Boolean(
    env.githubAppId() &&
      env.githubAppPrivateKey() &&
      env.githubAppWebhookSecret() &&
      env.githubAppSlug(),
  );
}

/** PEM private key; supports literal newlines or escaped \\n in env. */
export function githubAppPrivateKeyPem(): string | undefined {
  const raw = env.githubAppPrivateKey();
  if (!raw) return undefined;
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}
