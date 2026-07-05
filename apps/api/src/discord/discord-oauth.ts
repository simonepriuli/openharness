import { Result } from "better-result";
import { tryPromiseAllowFailure } from "../result-helpers.js";

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

async function discordFetch<T>(
  path: string,
  options: { accessToken?: string; botToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.botToken) headers.Authorization = `Bot ${options.botToken}`;

  const response = await fetch(`${DISCORD_API_BASE}${path}`, { headers });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord API error (${response.status}): ${text || response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function exchangeDiscordCode(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<DiscordTokenResponse> {
  const body = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
  });

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as DiscordTokenResponse;
}

export async function listUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const data = await discordFetch<Array<{ id: string; name: string }>>("/users/@me/guilds", {
    accessToken,
  });
  return data
    .filter((guild) => guild.id && guild.name)
    .map((guild) => ({ id: guild.id, name: guild.name }));
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  const data = await discordFetch<{ id: string; username: string }>("/users/@me", {
    accessToken,
  });
  if (!data.id) {
    throw new Error("Discord user profile did not include an id.");
  }
  return { id: data.id, username: data.username ?? "discord-user" };
}

export async function listBotGuilds(botToken: string): Promise<DiscordGuild[]> {
  const data = await discordFetch<Array<{ id: string; name: string }>>("/users/@me/guilds", {
    botToken,
  });
  return data
    .filter((guild) => guild.id && guild.name)
    .map((guild) => ({ id: guild.id, name: guild.name }));
}

export async function getBotGuild(
  botToken: string,
  guildId: string,
): Promise<DiscordGuild | null> {
  const guildResult = await tryPromiseAllowFailure(async () => {
    const guild = await discordFetch<{ id: string; name: string }>(
      `/guilds/${encodeURIComponent(guildId)}`,
      { botToken },
    );
    if (!guild.id || !guild.name) return null;
    return { id: guild.id, name: guild.name };
  });
  return Result.isOk(guildResult) ? guildResult.value : null;
}

export async function listGuildChannels(
  botToken: string,
  guildId: string,
): Promise<DiscordChannel[]> {
  const data = await discordFetch<Array<{ id: string; name: string; type: number }>>(
    `/guilds/${encodeURIComponent(guildId)}/channels`,
    { botToken },
  );
  return data.filter((channel) => channel.id && channel.name);
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
