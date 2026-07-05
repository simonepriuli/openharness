import { createDb } from "@openharness/db";
import { Hono } from "hono";
import { env } from "../env.js";
import { formatInviteCode } from "./invite-code.js";
import { checkJoinRateLimit } from "./join-rate-limit.js";
import {
  OrgDbError,
  createOrganizationForUser,
  getInviteCodeForOrg,
  getOrganizationById,
  isOrgAdmin,
  joinOrganizationWithInviteCode,
  listOrganizationMembers,
  regenerateInviteCode,
  updateOrganizationName,
  updateOrganizationCloudWorkersEnabled,
  userHasMembership,
} from "./org-db.js";
import { requireOrg, requireOrgAdmin, requireUser, type AppVariables } from "./middleware.js";
import {
  deleteOrgSecret,
  listOrgSecretStatus,
  resolveOrgSecrets,
  upsertOrgSecret,
} from "./org-secrets-db.js";
import { ORG_SECRET_SLOT_DISPLAY_NAMES, isOrgSecretSlot } from "@openharness/shared/org-secret-slots";
import { jsonFromHttpResultOk, tryOrgDb, tryOrgSecrets } from "../result-helpers.js";

const db = createDb(env.databaseUrl());

export const orgRoutes = new Hono<{ Variables: AppVariables }>();

orgRoutes.get("/onboarding/status", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const hasOrganization = await userHasMembership(db, user.id);
  return c.json({ hasOrganization });
});

orgRoutes.post("/onboarding/create", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json<{ name?: unknown }>().catch(() => null)) ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return c.json({ error: "Name is required" }, 400);

  const result = await tryOrgDb(() =>
    createOrganizationForUser(db, {
      userId: user.id,
      orgName: name,
      email: user.email,
    }),
  );
  return jsonFromHttpResultOk(c, result, (membership) => ({
    organization: {
      id: membership.organizationId,
      name: membership.organizationName,
      slug: membership.organizationSlug,
    },
    membership: {
      id: membership.memberId,
      role: membership.role,
    },
  }));
});

orgRoutes.post("/onboarding/join", async (c) => {
  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateKey = `${user.id}:${ip}`;
  if (!checkJoinRateLimit(rateKey)) {
    return c.json({ error: "Too many join attempts. Try again later." }, 429);
  }

  const body = (await c.req.json<{ code?: unknown }>().catch(() => null)) ?? {};
  const code = typeof body.code === "string" ? body.code : "";
  if (!code.trim()) return c.json({ error: "Invite code is required" }, 400);

  const result = await tryOrgDb(() => joinOrganizationWithInviteCode(db, user.id, code));
  return jsonFromHttpResultOk(c, result, (membership) => ({
    organization: {
      id: membership.organizationId,
      name: membership.organizationName,
      slug: membership.organizationSlug,
    },
    membership: {
      id: membership.memberId,
      role: membership.role,
    },
  }));
});

orgRoutes.get("/", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  return c.json({
    organization: {
      id: org.organizationId,
      name: org.organizationName,
      slug: org.organizationSlug,
      cloudWorkersEnabled: org.cloudWorkersEnabled,
    },
    membership: {
      id: org.memberId,
      role: org.role,
    },
  });
});

orgRoutes.get("/members", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const members = await listOrganizationMembers(db, org.organizationId);
  return c.json({ members });
});

orgRoutes.get("/can-manage", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ canManage: isOrgAdmin(org.role) });
});

orgRoutes.get("/invite-code", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const result = await tryOrgDb(() => getInviteCodeForOrg(db, org.organizationId));
  return jsonFromHttpResultOk(c, result, (code) => ({
    code,
    formatted: formatInviteCode(code),
  }));
});

orgRoutes.post("/invite-code/regenerate", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const code = await regenerateInviteCode(db, org.organizationId);
  return c.json({ code, formatted: formatInviteCode(code) });
});

orgRoutes.get("/secrets/resolve", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);

  const secrets = await resolveOrgSecrets(db, org.organizationId);
  return c.json({ secrets });
});

orgRoutes.get("/secrets", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const statuses = await listOrgSecretStatus(db, org.organizationId);
  return c.json({
    slots: statuses.map((row) => ({
      ...row,
      displayName: ORG_SECRET_SLOT_DISPLAY_NAMES[row.slot],
    })),
  });
});

orgRoutes.put("/secrets/:slot", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const slot = c.req.param("slot");
  if (!isOrgSecretSlot(slot)) {
    return c.json({ error: "Unknown secret slot", code: "INVALID_SLOT" }, 400);
  }

  const user = requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = (await c.req.json<{ value?: unknown }>().catch(() => null)) ?? {};
  const value = typeof body.value === "string" ? body.value : "";
  if (!value.trim()) {
    return c.json({ error: "Secret value is required", code: "INVALID_VALUE" }, 400);
  }

  const result = await tryOrgSecrets(() =>
    upsertOrgSecret(db, org.organizationId, user.id, slot, value),
  );
  return jsonFromHttpResultOk(c, result, (status) => ({
    slot: {
      ...status,
      displayName: ORG_SECRET_SLOT_DISPLAY_NAMES[status.slot],
    },
  }));
});

orgRoutes.delete("/secrets/:slot", async (c) => {
  const org = requireOrgAdmin(c);
  if (!org) return c.json({ error: "Forbidden" }, 403);

  const slot = c.req.param("slot");
  if (!isOrgSecretSlot(slot)) {
    return c.json({ error: "Unknown secret slot", code: "INVALID_SLOT" }, 400);
  }

  const removed = await deleteOrgSecret(db, org.organizationId, slot);
  if (!removed) {
    return c.json({ error: "Secret slot is not configured" }, 404);
  }
  return c.json({ ok: true });
});

orgRoutes.patch("/", async (c) => {
  const org = requireOrg(c);
  if (!org) return c.json({ error: "Unauthorized" }, 401);
  if (!isOrgAdmin(org.role)) return c.json({ error: "Forbidden" }, 403);

  const body =
    (await c.req.json<{ name?: unknown; cloudWorkersEnabled?: unknown }>().catch(() => null)) ??
    {};

  const hasName = body.name !== undefined;
  const hasCloudWorkers = typeof body.cloudWorkersEnabled === "boolean";

  if (!hasName && !hasCloudWorkers) {
    return c.json({ error: "No supported fields to update" }, 400);
  }

  const result = await tryOrgDb(async () => {
    let organization = hasName
      ? await updateOrganizationName(
          db,
          org.organizationId,
          typeof body.name === "string" ? body.name : "",
        )
      : await getOrganizationById(db, org.organizationId);

    if (!organization) {
      throw new OrgDbError("ORG_NOT_FOUND", "Organization not found");
    }

    if (hasCloudWorkers) {
      organization = await updateOrganizationCloudWorkersEnabled(
        db,
        org.organizationId,
        body.cloudWorkersEnabled as boolean,
      );
    }

    return organization;
  });

  return jsonFromHttpResultOk(c, result, (organization) => ({
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      cloudWorkersEnabled: organization.cloudWorkersEnabled,
    },
  }));
});
