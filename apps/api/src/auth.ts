import { electron } from "@better-auth/electron";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { createDb, schema } from "@openharness/db";
import { env, hasGithubOAuth } from "./env.js";

const db = createDb(env.databaseUrl());

const githubClientId = env.githubClientId();
const githubClientSecret = env.githubClientSecret();

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: env.betterAuthSecret(),
  baseURL: env.betterAuthUrl(),
  trustedOrigins: env.trustedOrigins(),
  experimental: {
    joins: true,
  },
  socialProviders:
    hasGithubOAuth() && githubClientId && githubClientSecret
      ? {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
          },
        }
      : {},
  plugins: [electron(), bearer()],
});

export type AuthSession = typeof auth.$Infer.Session;
