import { electron } from "@better-auth/electron";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { bearer, organization } from "better-auth/plugins";
import { createDb, eq, schema } from "@openharness/db";
import { member } from "@openharness/db/schema";
import { env, hasGithubOAuth } from "./env.js";

const db = createDb(env.databaseUrl());

const githubClientId = env.githubClientId();
const githubClientSecret = env.githubClientSecret();

async function rejectIfUserAlreadyInOrg(userId: string): Promise<void> {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  if (rows[0]) {
    throw new APIError("BAD_REQUEST", {
      message:
        "This account already belongs to an organization. Each user can only be in one organization.",
    });
  }
}

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
  plugins: [
    electron(),
    bearer(),
    organization({
      allowUserToCreateOrganization: true,
      organizationHooks: {
        beforeAddMember: async ({ member: pendingMember }) => {
          await rejectIfUserAlreadyInOrg(pendingMember.userId);
        },
        beforeAcceptInvitation: async ({ user: invitee }) => {
          await rejectIfUserAlreadyInOrg(invitee.id);
        },
      },
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
