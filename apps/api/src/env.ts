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
};

export function hasGithubOAuth(): boolean {
  return Boolean(env.githubClientId() && env.githubClientSecret());
}
