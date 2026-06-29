import type { Context } from "hono";
import { isAuthorizedCronRequest } from "../cron-auth.js";
import { env } from "../env.js";

export function isCloudWorkerAuthorized(authorizationHeader: string | undefined): boolean {
  const secret = env.cloudWorkerSecret();
  if (!secret) return false;
  return isAuthorizedCronRequest(authorizationHeader, secret);
}

export function requireCloudWorkerAuth(c: Context): boolean {
  return isCloudWorkerAuthorized(c.req.header("authorization"));
}
