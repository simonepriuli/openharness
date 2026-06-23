import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth, type AuthSession } from "./auth.js";
import { electronSignInPageHtml } from "./electron-sign-in.js";
import { isAuthorizedCronRequest } from "./cron-auth.js";
import { env, hasGithubApp, hasTeamsBot } from "./env.js";
import { githubRoutes } from "./github/routes.js";
import { runSchedulerTick, startWorkflowScheduler } from "./github/workflow-scheduler.js";
import { azureDevOpsRoutes } from "./azure-devops/routes.js";
import { registerAzureDevOpsSourceControlProvider } from "./azure-devops/adapter.js";
import { registerGithubSourceControlProvider } from "./source-control/github-adapter.js";
import { orgRoutes } from "./org/routes.js";
import { teamsRoutes } from "./teams/routes.js";
import { resolveAuthSession } from "./session-from-request.js";
import { createDb } from "@openharness/db";
import { orgContextMiddleware, type AppVariables } from "./org/middleware.js";

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
  try {
    session = await resolveAuthSession(c.req.raw.headers);
  } catch (err) {
    console.error("[auth] resolveAuthSession threw", err);
  }

  if (!session) {
    try {
      session = (await auth.api.getSession({
        request: c.req.raw,
        headers: c.req.raw.headers,
      })) as AuthSession | null;
    } catch (err) {
      console.error("[auth] getSession threw", err);
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
  try {
    const result = (await auth.api.getSession({
      request: c.req.raw,
      headers: c.req.raw.headers,
    })) as AuthSession | null;
    cookieSession = result
      ? { user: result.user.id, session: result.session.id }
      : null;
  } catch (err) {
    cookieError = err instanceof Error ? err.message : String(err);
  }

  let bearerSession: { user: string; session: string } | null = null;
  let bearerError: string | null = null;
  try {
    const result = await resolveAuthSession(c.req.raw.headers);
    bearerSession = result
      ? { user: result.user.id, session: result.session.id }
      : null;
  } catch (err) {
    bearerError = err instanceof Error ? err.message : String(err);
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

const schedulerDb = createDb(env.databaseUrl());
if (process.env.VERCEL !== "1") {
  startWorkflowScheduler(schedulerDb);
}

export default app;
