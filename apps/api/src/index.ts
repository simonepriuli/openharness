import { Hono } from "hono";
import { Result } from "better-result";
import { cors } from "hono/cors";
import { auth, type AuthSession } from "./auth.js";
import { electronSignInPageHtml } from "./electron-sign-in.js";
import { isAuthorizedCronRequest } from "./cron-auth.js";
import { env, hasDiscordBot, hasGithubApp, hasLinearOAuth, hasTeamsBot } from "./env.js";
import { githubRoutes } from "./github/routes.js";
import { runSchedulerTick, startWorkflowScheduler } from "./github/workflow-scheduler.js";
import { runLinearAgentWorkspaceCronTick, startLinearAgentWorkspaceReaper } from "./linear/linear-agent-workspace-cron.js";
import { azureDevOpsRoutes } from "./azure-devops/routes.js";
import { registerAzureDevOpsSourceControlProvider } from "./azure-devops/adapter.js";
import { registerGithubSourceControlProvider } from "./source-control/github-adapter.js";
import { sourceControlRoutes } from "./source-control/routes.js";
import { workflowRunRoutes } from "./source-control/workflow-runs.js";
import { orgRoutes } from "./org/routes.js";
import {
  repoEnvironmentInternalRoutes,
  repoEnvironmentRoutes,
} from "./repo-environment/routes.js";
import { cloudWorkerInternalRoutes } from "./cloud-worker/internal-routes.js";
import { linearAgentInternalRoutes } from "./cloud-worker/linear-agent-internal-routes.js";
import { cloudWorkerInternalOrgSecretsRoutes } from "./cloud-worker/internal-org-secrets.js";
import { cloudWorkerInternalSourceControlRoutes } from "./cloud-worker/internal-source-control.js";
import { teamsRoutes } from "./teams/routes.js";
import { discordRoutes } from "./discord/routes.js";
import { linearRoutes } from "./linear/routes.js";
import { resolveAuthSession } from "./session-from-request.js";
import { createDb } from "@openharness/db";
import { orgContextMiddleware, type AppVariables } from "./org/middleware.js";
import { errorMessage, tryPromiseAllowFailure } from "./result-helpers.js";

const trustedOrigins = env.trustedOrigins();

registerGithubSourceControlProvider();
registerAzureDevOpsSourceControlProvider();

const app = new Hono<{ Variables: AppVariables }>({
  strict: false,
});

app.use(
  "/api/auth/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.use("*", async (c, next) => {
  let session: AuthSession | null = null;

  // Bearer token first (Electron desktop and any non-browser caller).
  // Cookie-based auth has a known crash path inside auth.api.getSession when
  // combined with the bearer plugin on certain runtimes; bypass it when we
  // already have a valid bearer-resolved session.
  const bearerResult = await tryPromiseAllowFailure(() => resolveAuthSession(c.req.raw.headers));
  if (Result.isError(bearerResult)) {
    console.error("[auth] resolveAuthSession threw", bearerResult.error);
  } else {
    session = bearerResult.value;
  }

  if (!session) {
    const cookieResult = await tryPromiseAllowFailure(() =>
      auth.api.getSession({
        request: c.req.raw,
        headers: c.req.raw.headers,
      }) as Promise<AuthSession | null>,
    );
    if (Result.isError(cookieResult)) {
      console.error("[auth] getSession threw", cookieResult.error);
    } else {
      session = cookieResult.value;
    }
  }

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

app.use("*", orgContextMiddleware);

const signInPage = () => electronSignInPageHtml();

app.get("/", (c) => c.html(signInPage()));
app.get("/api/auth", (c) => c.redirect("/api/auth/sign-in"));
app.get("/api/auth/sign-in", (c) => c.html(signInPage()));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => {
  return c.json({
    ok: true,
    githubAppConfigured: hasGithubApp(),
    teamsBotConfigured: hasTeamsBot(),
    discordBotConfigured: hasDiscordBot(),
    linearOAuthConfigured: hasLinearOAuth(),
    bearerAuthEnabled: true,
  });
});

app.get("/api/cron/workflow-scheduler", async (c) => {
  const cronSecret = env.cronSecret();
  if (!cronSecret) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  if (!isAuthorizedCronRequest(c.req.header("authorization"), cronSecret)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = createDb(env.databaseUrl());
  const summary = await runSchedulerTick(db);
  return c.json({ ok: true, ...summary });
});

app.get("/api/cron/linear-agent-workspaces", async (c) => {
  const cronSecret = env.cronSecret();
  if (!cronSecret) {
    return c.json({ error: "CRON_SECRET is not configured" }, 503);
  }

  if (!isAuthorizedCronRequest(c.req.header("authorization"), cronSecret)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = createDb(env.databaseUrl());
  const summary = await runLinearAgentWorkspaceCronTick(db);
  return c.json({ ok: true, ...summary });
});

app.get("/api/me", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const org = c.get("org");
  return c.json({ user, organization: org });
});

/**
 * Diagnostic endpoint: returns what the server sees for the current request
 * (cookie names, bearer token presence, resolved user). Safe — never returns
 * the raw session token or signature.
 */
app.get("/api/debug/session", async (c) => {
  const cookieHeader = c.req.raw.headers.get("cookie") ?? "";
  const cookieNames = cookieHeader
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter((name): name is string => Boolean(name));
  const authHeader = c.req.raw.headers.get("authorization") ?? "";
  const hasBearer = authHeader.toLowerCase().startsWith("bearer ");
  const bearerLength = hasBearer ? authHeader.slice(7).trim().length : 0;

  let cookieSession: { user: string; session: string } | null = null;
  let cookieError: string | null = null;
  const cookieResult = await tryPromiseAllowFailure(() =>
    auth.api.getSession({
      request: c.req.raw,
      headers: c.req.raw.headers,
    }) as Promise<AuthSession | null>,
  );
  if (Result.isError(cookieResult)) {
    cookieError = errorMessage(cookieResult.error);
  } else {
    cookieSession = cookieResult.value
      ? { user: cookieResult.value.user.id, session: cookieResult.value.session.id }
      : null;
  }

  let bearerSession: { user: string; session: string } | null = null;
  let bearerError: string | null = null;
  const bearerResult = await tryPromiseAllowFailure(() => resolveAuthSession(c.req.raw.headers));
  if (Result.isError(bearerResult)) {
    bearerError = errorMessage(bearerResult.error);
  } else {
    bearerSession = bearerResult.value
      ? { user: bearerResult.value.user.id, session: bearerResult.value.session.id }
      : null;
  }

  const user = c.get("user");

  return c.json({
    request: {
      cookieNames,
      hasBearer,
      bearerLength,
      origin: c.req.raw.headers.get("origin"),
      electronOrigin: c.req.raw.headers.get("electron-origin"),
      userAgent: c.req.raw.headers.get("user-agent"),
    },
    cookieAuth: { session: cookieSession, error: cookieError },
    bearerAuth: { session: bearerSession, error: bearerError },
    middlewareResolvedUserId: user?.id ?? null,
  });
});

app.use(
  "/api/github/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/github", githubRoutes);

app.use(
  "/api/source-control/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "X-Organization-Id"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/source-control", sourceControlRoutes);

app.use(
  "/api/workflow-runs/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/workflow-runs", workflowRunRoutes);

app.use(
  "/api/azure-devops/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/azure-devops", azureDevOpsRoutes);

app.use(
  "/api/teams/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/teams", teamsRoutes);

app.use(
  "/api/discord/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/discord", discordRoutes);

app.use(
  "/api/linear/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "X-Workflow-Run-Id",
    ],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/linear", linearRoutes);

app.use(
  "/api/org/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/org", orgRoutes);

app.use(
  "/api/repo-environments/*",
  cors({
    origin: (origin) => {
      if (!origin) {
        return trustedOrigins[0] ?? env.betterAuthUrl();
      }
      return trustedOrigins.includes(origin) ? origin : null;
    },
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.route("/api/repo-environments", repoEnvironmentRoutes);

app.route("/api/internal/repo-environments", repoEnvironmentInternalRoutes);

app.route("/api/internal/workflow-runs", cloudWorkerInternalRoutes);

app.route("/api/internal/linear-agent-runs", linearAgentInternalRoutes);

app.route("/api/internal/source-control", cloudWorkerInternalSourceControlRoutes);

app.route("/api/internal/org-secrets", cloudWorkerInternalOrgSecretsRoutes);

const schedulerDb = createDb(env.databaseUrl());
if (process.env.VERCEL !== "1") {
  startWorkflowScheduler(schedulerDb);
  startLinearAgentWorkspaceReaper(schedulerDb);
}

export default app;
