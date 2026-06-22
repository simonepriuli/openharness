import { createDb } from "@openharness/db";
import { Hono } from "hono";
import { ActivityHandler, type TurnContext } from "botbuilder";
import type { AuthSession } from "../auth.js";
import { env, hasMicrosoftOAuth, hasTeamsBot } from "../env.js";
import { createInstallState, verifyInstallState } from "../github/install-state.js";
import {
  deleteChannelMapping,
  getTeamsInstallationForUserTeam,
  listChannelMappingsForUser,
  listTeamsInstallationsForUser,
  upsertChannelRepoMapping,
  upsertTeamsInstallation,
} from "./teams-db.js";
import {
  buildMicrosoftOAuthUrl,
  exchangeMicrosoftCode,
  listJoinedTeams,
  listTeamChannels,
} from "./teams-graph.js";
import { getTeamsBotAdapter } from "./teams-notify.js";
import { handleTeamsMentionActivity } from "./workflow-teams-webhook.js";

type TeamsVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

const db = createDb(env.databaseUrl());

function requireUser(c: { get: (key: "user") => AuthSession["user"] | null }) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

function teamsResultPage(success: boolean, message: string): string {
  const title = success ? "Teams connected" : "Teams connection failed";
  const color = success ? "#16a34a" : "#dc2626";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:system-ui;padding:2rem;max-width:32rem;margin:auto"><h1 style="color:${color}">${title}</h1><p>${message}</p><p>You can close this window and return to OpenHarness.</p></body></html>`;
}

export const teamsRoutes = new Hono<{ Variables: TeamsVariables }>();

teamsRoutes.get("/status", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  if (!hasTeamsBot() || !hasMicrosoftOAuth()) {
    return c.json({
      configured: false,
      connected: false,
      installations: [],
      mappings: [],
    });
  }

  const installations = await listTeamsInstallationsForUser(db, user.id);
  const mappings = await listChannelMappingsForUser(db, user.id);

  return c.json({
    configured: true,
    connected: installations.length > 0,
    installations,
    mappings,
  });
});

teamsRoutes.get("/connect-url", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  if (!hasMicrosoftOAuth()) {
    return c.json({ error: "Microsoft OAuth is not configured" }, 503);
  }

  const state = createInstallState(user.id);
  const url = buildMicrosoftOAuthUrl({
    clientId: env.microsoftClientId()!,
    redirectUri: env.microsoftOAuthRedirectUri()!,
    state,
  });

  return c.json({ url });
});

teamsRoutes.get("/oauth/callback", async (c) => {
  if (!hasMicrosoftOAuth()) {
    return c.html(teamsResultPage(false, "Microsoft OAuth is not configured on the server."));
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.html(teamsResultPage(false, "Missing OAuth parameters from Microsoft."));
  }

  const verified = verifyInstallState(state);
  if (!verified) {
    return c.html(
      teamsResultPage(false, "Connect link expired or invalid. Try again from OpenHarness."),
    );
  }

  try {
    const token = await exchangeMicrosoftCode({
      clientId: env.microsoftClientId()!,
      clientSecret: env.microsoftClientSecret()!,
      redirectUri: env.microsoftOAuthRedirectUri()!,
      code,
    });

    const teams = await listJoinedTeams(token.access_token);
    if (teams.length === 0) {
      return c.html(
        teamsResultPage(
          false,
          "No Microsoft Teams found for this account. Join a team first, then try again.",
        ),
      );
    }

    for (const team of teams) {
      await upsertTeamsInstallation(db, {
        userId: verified.userId,
        tenantId: token.tenant ?? "common",
        teamId: team.id,
        teamName: team.displayName,
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        tokenExpiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : null,
      });
    }

    return c.html(
      teamsResultPage(
        true,
        `Connected ${teams.length} team(s). Return to OpenHarness to map channels to repositories.`,
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect Microsoft Teams";
    return c.html(teamsResultPage(false, message));
  }
});

teamsRoutes.get("/teams", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const installations = await listTeamsInstallationsForUser(db, user.id);
  return c.json({
    teams: installations.map((row) => ({
      installationId: row.id,
      teamId: row.teamId,
      teamName: row.teamName,
      tenantId: row.tenantId,
    })),
  });
});

teamsRoutes.get("/teams/:teamId/channels", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const teamId = c.req.param("teamId");
  const installation = await getTeamsInstallationForUserTeam(db, user.id, teamId);
  if (!installation) {
    return c.json({ error: "Teams installation not found" }, 404);
  }

  const channels = await listTeamChannels(installation.accessToken, teamId);
  return c.json({ channels });
});

teamsRoutes.get("/mappings", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const mappings = await listChannelMappingsForUser(db, user.id);
  return c.json({ mappings });
});

teamsRoutes.post("/mappings", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => null);
  if (
    !body ||
    typeof body.installationId !== "string" ||
    typeof body.teamId !== "string" ||
    typeof body.channelId !== "string" ||
    typeof body.channelName !== "string" ||
    typeof body.githubOwner !== "string" ||
    typeof body.githubRepo !== "string"
  ) {
    return c.json({ error: "Invalid mapping payload" }, 400);
  }

  const installations = await listTeamsInstallationsForUser(db, user.id);
  const installation = installations.find((row) => row.id === body.installationId);
  if (!installation) {
    return c.json({ error: "Teams installation not found" }, 404);
  }

  const mapping = await upsertChannelRepoMapping(db, {
    userId: user.id,
    installationId: body.installationId,
    teamId: body.teamId,
    channelId: body.channelId,
    channelName: body.channelName,
    githubOwner: body.githubOwner.trim(),
    githubRepo: body.githubRepo.trim(),
  });

  return c.json({ ok: true, mapping });
});

teamsRoutes.delete("/mappings/:id", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const deleted = await deleteChannelMapping(db, user.id, c.req.param("id"));
  if (!deleted) return c.json({ error: "Mapping not found" }, 404);
  return c.json({ ok: true });
});

const teamsBotHandler = new ActivityHandler();
teamsBotHandler.onMessage(async (context: TurnContext, next) => {
  const botAppId = env.teamsBotAppId();
  if (botAppId) {
    await handleTeamsMentionActivity(db, context.activity, botAppId);
  }
  await next();
});

teamsRoutes.post("/messages", async (c) => {
  if (!hasTeamsBot()) {
    return c.json({ error: "Teams bot is not configured" }, 503);
  }

  const authorization = c.req.header("authorization") ?? "";
  const activity = await c.req.json();
  const adapter = getTeamsBotAdapter();

  await adapter.processActivityDirect(authorization, activity, async (context) => {
    await teamsBotHandler.run(context);
  });

  return c.body(null, 200);
});
