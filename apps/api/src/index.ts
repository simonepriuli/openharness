import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth, type AuthSession } from "./auth.js";
import { electronSignInPageHtml } from "./electron-sign-in.js";
import { env } from "./env.js";
import { githubRoutes } from "./github/routes.js";

type AppVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
};

const trustedOrigins = env.trustedOrigins();

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
  const session = await auth.api.getSession({
    headers: new Headers(c.req.raw.headers),
  });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);
  await next();
});

const signInPage = () => electronSignInPageHtml();

app.get("/", (c) => c.html(signInPage()));
app.get("/api/auth", (c) => c.redirect("/api/auth/sign-in"));
app.get("/api/auth/sign-in", (c) => c.html(signInPage()));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => {
  return c.json({ ok: true });
});

app.get("/api/me", (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json({ user });
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

export default app;
