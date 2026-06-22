import type { Context } from "hono";
import type { AuthSession } from "../auth.js";
import type { OrgMembership } from "./org-db.js";

export type AppVariables = {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
  org: OrgMembership | null;
};

export type OrgContext = OrgMembership;

export function requireUser(c: Context<{ Variables: AppVariables }>) {
  const user = c.get("user");
  if (!user) return null;
  return user;
}

export function requireOrg(c: Context<{ Variables: AppVariables }>): OrgContext | null {
  const org = c.get("org");
  if (!org) return null;
  return org;
}

export function requireOrgAdmin(c: Context<{ Variables: AppVariables }>): OrgContext | null {
  const org = requireOrg(c);
  if (!org) return null;
  if (org.role !== "owner" && org.role !== "admin") return null;
  return org;
}
