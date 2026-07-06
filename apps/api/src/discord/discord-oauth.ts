import { Result } from "better-result";
import { DiscordApiError, OAuthError } from "../errors.js";

const DISCORD_API_BASE = "https://discord.com/api/v10";
// View Channels + Send Messages + Read Message History.
const DISCORD_BOT_PERMISSIONS = "11264";

export type DiscordGuild = { id: string; name: string };
export type DiscordChannel = { id: string; name: string; type: number };
export type DiscordUser = { id: string; username: string };

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

function mapDiscordCatch(cause: unknown, fallbackMessage: string): DiscordApiError {
  return DiscordApiError.is(cause)
    ? cause
    : new DiscordApiError({
        message: cause instanceof Error ? cause.message : fallbackMessage,
        cause,
      });
}

function discordFetch<T>(
  path: string,
  options: { accessToken?: string; botToken?: string } = {},
): Promise<Result<T, DiscordApiError>> {
  return Result.tryPromise({
    try: async () => {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
      if (options.botToken) headers.Authorization = `Bot ${options.botToken}`;

      const response = await fetch(`${DISCORD_API_BASE}${path}`, { headers });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new DiscordApiError({
          message: `Discord API error (${response.status}): ${text || response.statusText}`,
          status: response.status,
        });
      }
      return (await response.json()) as T;
    },
    catch: (cause) => mapDiscordCatch(cause, "Discord API request failed"),
  });
}

export async function exchangeDiscordCode(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<Result<DiscordTokenResponse, DiscordApiError | OAuthError>> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
  });

  return Result.tryPromise({
    try: async () => {
      const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new OAuthError({
          message: `Discord token exchange failed (${response.status}): ${text}`,
        });
      }

      return (await response.json()) as DiscordTokenResponse;
    },
    catch: (cause) => {
      if (OAuthError.is(cause)) return cause;
      if (DiscordApiError.is(cause)) return cause;
      return new OAuthError({
        message: cause instanceof Error ? cause.message : "Discord token exchange failed",
        cause,
      });
    },
  });
}

export async function listUserGuilds(
  accessToken: string,
): Promise<Result<DiscordGuild[], DiscordApiError>> {
  const dataResult = await discordFetch<Array<{ id: string; name: string }>>("/users/@me/guilds", {
    accessToken,
  });
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(
    dataResult.value
      .filter((guild) => guild.id && guild.name)
      .map((guild) => ({ id: guild.id, name: guild.name })),
  );
}

export async function getDiscordUser(
  accessToken: string,
): Promise<Result<DiscordUser, DiscordApiError>> {
  const dataResult = await discordFetch<{ id: string; username: string }>("/users/@me", {
    accessToken,
  });
  if (Result.isError(dataResult)) return dataResult;

  const data = dataResult.value;
  if (!data.id) {
    return Result.err(
      new DiscordApiError({ message: "Discord user profile did not include an id." }),
    );
  }
  return Result.ok({ id: data.id, username: data.username ?? "discord-user" });
}

export async function listBotGuilds(
  botToken: string,
): Promise<Result<DiscordGuild[], DiscordApiError>> {
  const dataResult = await discordFetch<Array<{ id: string; name: string }>>("/users/@me/guilds", {
    botToken,
  });
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(
    dataResult.value
      .filter((guild) => guild.id && guild.name)
      .map((guild) => ({ id: guild.id, name: guild.name })),
  );
}

export async function getBotGuild(
  botToken: string,
  guildId: string,
): Promise<Result<DiscordGuild | null, DiscordApiError>> {
  const guildResult = await discordFetch<{ id: string; name: string }>(
    `/guilds/${encodeURIComponent(guildId)}`,
    { botToken },
  );
  if (Result.isError(guildResult)) {
    if (guildResult.error.status === 404) return Result.ok(null);
    return guildResult;
  }

  const guild = guildResult.value;
  if (!guild.id || !guild.name) return Result.ok(null);
  return Result.ok({ id: guild.id, name: guild.name });
}

export async function listGuildChannels(
  botToken: string,
  guildId: string,
): Promise<Result<DiscordChannel[], DiscordApiError>> {
  const dataResult = await discordFetch<Array<{ id: string; name: string; type: number }>>(
    `/guilds/${encodeURIComponent(guildId)}/channels`,
    { botToken },
  );
  if (Result.isError(dataResult)) return dataResult;
  return Result.ok(dataResult.value.filter((channel) => channel.id && channel.name));
}

export function buildDiscordOAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    response_type: "code",
    redirect_uri: options.redirectUri,
    scope: "identify guilds bot applications.commands",
    permissions: DISCORD_BOT_PERMISSIONS,
    disable_guild_select: "false",
    state: options.state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
