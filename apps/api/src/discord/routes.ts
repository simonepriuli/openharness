import { createDb } from "@openharness/db";
import { and, eq } from "@openharness/db";
import { createPublicKey, verify } from "node:crypto";
import { Hono } from "hono";
import { env, hasDiscordBot, hasDiscordOAuth } from "../env.js";
import { createInstallState, verifyInstallState } from "../github/install-state.js";
import { requireOrg, requireUser, type AppVariables } from "../org/middleware.js";
import {
  deleteDiscordChannelMapping,
  getDiscordInstallationForOrgGuild,
  listDiscordInstallationsForOrg,
  findDiscordMappingByChannelId,
  listDiscordMappingsForOrg,
  upsertDiscordChannelRepoMapping,
  upsertDiscordInstallation,
} from "./discord-db.js";
import {
  buildDiscordOAuthUrl,
  exchangeDiscordCode,
  listGuildChannels,
  listUserGuilds,
} from "./discord-oauth.js";
import { handleDiscordMentionActivity } from "./workflow-discord-webhook.js";
import { account } from "@openharness/db/schema";

const db = createDb(env.databaseUrl());
const ED25519_PUBLIC_KEY_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function discordResultPage(success: boolean, message: string): string {
  const title = success ? "Discord connected" : "Discord connection failed";
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1 style="color:${color}">${title}</h1><p>${message}</p><p>You can close this window and return to OpenHarness.</p></body></html>`;
}

export const discordRoutes = new Hono<{ Variables: AppVariables }>();

function discordPublicKeyObject() {
  const hex = env.discordPublicKey();
  if (!hex) return null;
  try {
    const keyBytes = Buffer.from(hex, "hex");
    const der = Buffer.concat([ED25519_PUBLIC_KEY_PREFIX, keyBytes]);
    return createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    return null;
  }
}

function verifyDiscordInteractionSignature(rawBody: string, signature: string, timestamp: string): boolean {
  const key = discordPublicKeyObject();
  if (!key) return false;
  try {
    return verify(
      null,
      Buffer.from(timestamp + rawBody),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

async function isDiscordUserLinkedForMapping(
  channelId: string,
  discordUserId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const mapping = await findDiscordMappingByChannelId(db, channelId);
  if (!mapping) {
    return { ok: false, reason: "No repository mapping exists for this Discord channel." };
  }
  const matches = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, mapping.userId),
        eq(account.providerId, "discord"),
        eq(account.accountId, discordUserId),
      ),
    )
    .limit(1);
  if (matches.length === 0) {
    return {
      ok: false,
      reason:
        "Your Discord identity is not linked to the OpenHarness user that owns this channel mapping.",
    };
  }
  return { ok: true };
}

discordRoutes.get("/status", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  if (!hasDiscordOAuth() || !hasDiscordBot()) {
    return c.json({
      configured: false,
      connected: false,
      installations: [],
      mappings: [],
    });
  }

  const installations = await listDiscordInstallationsForOrg(db, org.organizationId);
  const mappings = await listDiscordMappingsForOrg(db, org.organizationId);

  return c.json({
    configured: true,
    connected: installations.length > 0,
    installations,
    mappings,
  });
});

discordRoutes.get("/connect-url", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  if (!hasDiscordOAuth()) {
    return c.json({ error: "Discord OAuth is not configured" }, 503);
  }

  const state = createInstallState(user.id, org.organizationId);
  const url = buildDiscordOAuthUrl({
    clientId: env.discordClientId()!,
    redirectUri: env.discordOAuthRedirectUri()!,
    state,
  });
  return c.json({ url });
});

discordRoutes.get("/oauth/callback", async (c) => {
  if (!hasDiscordOAuth()) {
    return c.html(discordResultPage(false, "Discord OAuth is not configured on the server."));
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.html(discordResultPage(false, "Missing OAuth parameters from Discord."));
  }

  const verified = verifyInstallState(state);
  if (!verified) {
    return c.html(
      discordResultPage(false, "Connect link expired or invalid. Try again from OpenHarness."),
    );
  }

  try {
    const token = await exchangeDiscordCode({
      clientId: env.discordClientId()!,
      clientSecret: env.discordClientSecret()!,
      redirectUri: env.discordOAuthRedirectUri()!,
      code,
    });

    const guilds = await listUserGuilds(token.access_token);
    if (guilds.length === 0) {
      return c.html(
        discordResultPage(
          false,
          "No Discord servers found for this account. Join a server and try again.",
        ),
      );
    }

    for (const guild of guilds) {
      await upsertDiscordInstallation(db, {
        organizationId: verified.organizationId,
        userId: verified.userId,
        guildId: guild.id,
        guildName: guild.name,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
      });
    }

    return c.html(
      discordResultPage(
        true,
        `Connected ${guilds.length} server(s). Return to OpenHarness to map channels to repositories.`,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect Discord";
    return c.html(discordResultPage(false, message));
  }
});

discordRoutes.get("/guilds", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const installations = await listDiscordInstallationsForOrg(db, org.organizationId);
  return c.json({
    guilds: installations.map((row) => ({
      installationId: row.id,
      guildId: row.guildId,
      guildName: row.guildName,
    })),
  });
});

discordRoutes.get("/guilds/:guildId/channels", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const guildId = c.req.param("guildId");
  const installation = await getDiscordInstallationForOrgGuild(db, org.organizationId, guildId);
  if (!installation) {
    return c.json({ error: "Discord installation not found" }, 404);
  }

  const botToken = env.discordBotToken();
  if (!botToken) {
    return c.json({ error: "Discord bot token not configured" }, 503);
  }

  const channels = await listGuildChannels(botToken, guildId);
  return c.json({ channels });
});

discordRoutes.get("/mappings", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);
  const mappings = await listDiscordMappingsForOrg(db, org.organizationId);
  return c.json({ mappings });
});

discordRoutes.post("/mappings", async (c) => {
  const user = requireUser(c);
  const org = requireOrg(c);
  if (!user || !org) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.installationId !== "string" ||
    typeof body.guildId !== "string" ||
    typeof body.channelId !== "string" ||
    typeof body.channelName !== "string" ||
    (typeof body.githubOwner !== "string" && typeof body.namespace !== "string") ||
    (typeof body.githubRepo !== "string" && typeof body.repoName !== "string")
  ) {
    return c.json({ error: "Invalid mapping payload" }, 400);
  }

  const provider =
    typeof body.provider === "string" && body.provider.trim()
      ? body.provider.trim()
      : "github";
  const namespace = (body.namespace ?? body.githubOwner).trim();
  const repoName = (body.repoName ?? body.githubRepo).trim();

  const installations = await listDiscordInstallationsForOrg(db, org.organizationId);
  const installation = installations.find((row) => row.id === body.installationId);
  if (!installation) {
    return c.json({ error: "Discord installation not found" }, 404);
  }

  const mapping = await upsertDiscordChannelRepoMapping(db, {
    organizationId: org.organizationId,
    userId: user.id,
    installationId: body.installationId,
    guildId: body.guildId,
    channelId: body.channelId,
    channelName: body.channelName,
    provider,
    namespace,
    repoName,
    projectSourceControlConnectionId:
      typeof body.projectSourceControlConnectionId === "string"
        ? body.projectSourceControlConnectionId
        : null,
  });
  return c.json({ ok: true, mapping });
});

discordRoutes.delete("/mappings/:id", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const deleted = await deleteDiscordChannelMapping(db, org.organizationId, c.req.param("id"));
  if (!deleted) return c.json({ error: "Mapping not found" }, 404);
  return c.json({ ok: true });
});

discordRoutes.post("/interactions", async (c) => {
  if (!hasDiscordBot()) {
    return c.json({ error: "Discord bot is not configured" }, 503);
  }

  const signature = c.req.header("x-signature-ed25519");
  const timestamp = c.req.header("x-signature-timestamp");
  if (!signature || !timestamp) {
    return c.json({ error: "Missing Discord signature headers" }, 401);
  }

  const rawBody = await c.req.text();
  const verified = verifyDiscordInteractionSignature(rawBody, signature, timestamp);
  if (!verified) {
    return c.json({ error: "Invalid Discord signature" }, 401);
  }

  const interaction = JSON.parse(rawBody) as {
    type?: number;
    data?: { name?: string; options?: Array<{ name?: string; value?: unknown }> };
    channel_id?: string;
    id?: string;
    member?: { user?: { id?: string } };
    user?: { id?: string };
  };

  // Discord ping validation challenge.
  if (interaction.type === 1) {
    return c.json({ type: 1 });
  }

  // Application command: /openharness message:<text>
  if (interaction.type === 2 && interaction.data?.name === "openharness") {
    const messageText =
      interaction.data.options?.find((option) => option.name === "message")?.value;
    const content = typeof messageText === "string" ? messageText.trim() : "";
    if (!interaction.channel_id || !content) {
      return c.json({
        type: 4,
        data: { content: "Missing channel or message input.", flags: 64 },
      });
    }

    const botToken = env.discordBotToken();
    if (!botToken) {
      return c.json({ type: 4, data: { content: "Discord bot token is not configured.", flags: 64 } });
    }

    const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
    if (!discordUserId) {
      return c.json({
        type: 4,
        data: { content: "Could not resolve your Discord user identity.", flags: 64 },
      });
    }

    const linked = await isDiscordUserLinkedForMapping(interaction.channel_id, discordUserId);
    if (!linked.ok) {
      return c.json({
        type: 4,
        data: {
          content:
            linked.reason ??
            "This action is denied because your Discord account is not linked for this mapping.",
          flags: 64,
        },
      });
    }

    await handleDiscordMentionActivity(db, {
      botToken,
      channelId: interaction.channel_id,
      messageText: content,
      messageId: interaction.id ?? `${Date.now()}`,
      userId: discordUserId,
    });

    return c.json({
      type: 4,
      data: { content: "Queued workflow run(s). I will post follow-up results here.", flags: 64 },
    });
  }

  return c.json({
    type: 4,
    data: { content: "Unsupported Discord interaction.", flags: 64 },
  });
});
