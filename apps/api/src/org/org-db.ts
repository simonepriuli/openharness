import { randomUUID } from "node:crypto";
import { and, eq, type Database } from "@openharness/db";
import { member, organization, user } from "@openharness/db/schema";
import { Result } from "better-result";
import { OrgDbError } from "../errors.js";
import { generateInviteCode, normalizeInviteCode } from "./invite-code.js";

export type OrgMembership = {
  memberId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  cloudWorkersEnabled: boolean;
  role: string;
};

export type OrgAdminRole = "owner" | "admin";

const ADMIN_ROLES = new Set<string>(["owner", "admin"]);

export function isOrgAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role);
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || "org";
}

function defaultOrgName(userName: string): string {
  const trimmed = userName.trim();
  return trimmed ? `${trimmed}'s Organization` : "My Organization";
}

async function generateUniqueInviteCode(db: Database): Promise<Result<string, OrgDbError>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateInviteCode();
    const rows = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.inviteCode, code))
      .limit(1);
    if (!rows[0]) return Result.ok(code);
  }
  return Result.err(
    new OrgDbError({ code: "CODE_GENERATION_FAILED", message: "Failed to generate a unique invite code" }),
  );
}

async function ensureUniqueSlug(db: Database, baseSlug: string): Promise<Result<string, OrgDbError>> {
  let candidate = baseSlug;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, candidate))
      .limit(1);
    if (!rows[0]) return Result.ok(candidate);
    candidate = `${baseSlug}-${randomUUID().slice(0, 6)}`;
  }
  return Result.err(
    new OrgDbError({ code: "SLUG_CONFLICT", message: "Could not allocate a unique organization slug" }),
  );
}

export async function getMembershipForUser(
  db: Database,
  userId: string,
): Promise<OrgMembership | null> {
  const rows = await db
    .select({
      memberId: member.id,
      organizationId: member.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      cloudWorkersEnabled: organization.cloudWorkersEnabled,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    memberId: row.memberId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    cloudWorkersEnabled: row.cloudWorkersEnabled,
    role: row.role,
  };
}

export async function userHasMembership(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return Boolean(rows[0]);
}

async function assertUserNotInOrg(db: Database, userId: string): Promise<Result<void, OrgDbError>> {
  if (await userHasMembership(db, userId)) {
    return Result.err(
      new OrgDbError({
        code: "ALREADY_IN_ORG",
        message:
          "This account already belongs to an organization. Each user can only be in one organization.",
      }),
    );
  }
  return Result.ok(undefined);
}

export async function createOrganizationForUser(
  db: Database,
  input: { userId: string; orgName: string; email: string },
): Promise<Result<OrgMembership, OrgDbError>> {
  const notInOrg = await assertUserNotInOrg(db, input.userId);
  if (Result.isError(notInOrg)) return notInOrg;

  const name = input.orgName.trim();
  if (!name) {
    return Result.err(new OrgDbError({ code: "INVALID_NAME", message: "Organization name is required" }));
  }

  const orgSlugResult = await ensureUniqueSlug(db, slugify(name));
  if (Result.isError(orgSlugResult)) return orgSlugResult;
  const orgSlug = orgSlugResult.value;

  const inviteCodeResult = await generateUniqueInviteCode(db);
  if (Result.isError(inviteCodeResult)) return inviteCodeResult;
  const inviteCode = inviteCodeResult.value;

  const orgId = randomUUID();
  const memberId = randomUUID();

  await db.insert(organization).values({
    id: orgId,
    name,
    slug: orgSlug,
    inviteCode,
  });

  await db.insert(member).values({
    id: memberId,
    organizationId: orgId,
    userId: input.userId,
    role: "owner",
  });

  return Result.ok({
    memberId,
    organizationId: orgId,
    organizationName: name,
    organizationSlug: orgSlug,
    cloudWorkersEnabled: false,
    role: "owner",
  });
}

export async function createPersonalOrganizationForUser(
  db: Database,
  input: { userId: string; name: string; email: string },
): Promise<Result<OrgMembership, OrgDbError>> {
  return createOrganizationForUser(db, {
    userId: input.userId,
    orgName: defaultOrgName(input.name),
    email: input.email,
  });
}

export async function joinOrganizationWithInviteCode(
  db: Database,
  userId: string,
  rawCode: string,
): Promise<Result<OrgMembership, OrgDbError>> {
  const notInOrg = await assertUserNotInOrg(db, userId);
  if (Result.isError(notInOrg)) return notInOrg;

  const code = normalizeInviteCode(rawCode);
  if (!code) {
    return Result.err(new OrgDbError({ code: "INVALID_CODE", message: "Invite code is required" }));
  }

  const orgRows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      cloudWorkersEnabled: organization.cloudWorkersEnabled,
    })
    .from(organization)
    .where(eq(organization.inviteCode, code))
    .limit(1);

  const org = orgRows[0];
  if (!org) {
    return Result.err(new OrgDbError({ code: "INVALID_CODE", message: "Invalid invite code" }));
  }

  const memberId = randomUUID();
  await db.insert(member).values({
    id: memberId,
    organizationId: org.id,
    userId,
    role: "member",
  });

  return Result.ok({
    memberId,
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    cloudWorkersEnabled: org.cloudWorkersEnabled,
    role: "member",
  });
}

export async function getInviteCodeForOrg(
  db: Database,
  organizationId: string,
): Promise<Result<string, OrgDbError>> {
  const rows = await db
    .select({ inviteCode: organization.inviteCode })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  const code = rows[0]?.inviteCode;
  if (!code) {
    return Result.err(new OrgDbError({ code: "ORG_NOT_FOUND", message: "Organization not found" }));
  }
  return Result.ok(code);
}

export async function regenerateInviteCode(
  db: Database,
  organizationId: string,
): Promise<Result<string, OrgDbError>> {
  const newCodeResult = await generateUniqueInviteCode(db);
  if (Result.isError(newCodeResult)) return newCodeResult;
  const newCode = newCodeResult.value;

  await db
    .update(organization)
    .set({ inviteCode: newCode })
    .where(eq(organization.id, organizationId));
  return Result.ok(newCode);
}

export async function listOrganizationMembers(
  db: Database,
  organizationId: string,
): Promise<
  Array<{
    id: string;
    role: string;
    createdAt: string;
    user: { id: string; name: string; email: string; image: string | null };
  }>
> {
  const rows = await db
    .select({
      id: member.id,
      role: member.role,
      createdAt: member.createdAt,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userImage: user.image,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    user: {
      id: row.userId,
      name: row.userName,
      email: row.userEmail,
      image: row.userImage,
    },
  }));
}

export async function getOrganizationById(
  db: Database,
  organizationId: string,
): Promise<{ id: string; name: string; slug: string; cloudWorkersEnabled: boolean } | null> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      cloudWorkersEnabled: organization.cloudWorkersEnabled,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCloudWorkerOrgContext(
  db: Database,
  organizationId: string,
): Promise<{ id: string; name: string; slug: string; cloudWorkersEnabled: boolean } | null> {
  const org = await getOrganizationById(db, organizationId);
  if (!org?.cloudWorkersEnabled) {
    return null;
  }
  return org;
}

export async function updateOrganizationName(
  db: Database,
  organizationId: string,
  name: string,
): Promise<
  Result<{ id: string; name: string; slug: string; cloudWorkersEnabled: boolean }, OrgDbError>
> {
  const trimmed = name.trim();
  if (!trimmed) {
    return Result.err(new OrgDbError({ code: "INVALID_NAME", message: "Organization name is required" }));
  }

  await db
    .update(organization)
    .set({ name: trimmed })
    .where(eq(organization.id, organizationId));

  const updated = await getOrganizationById(db, organizationId);
  if (!updated) {
    return Result.err(new OrgDbError({ code: "ORG_NOT_FOUND", message: "Organization not found" }));
  }
  return Result.ok(updated);
}

export async function updateOrganizationCloudWorkersEnabled(
  db: Database,
  organizationId: string,
  cloudWorkersEnabled: boolean,
): Promise<
  Result<{ id: string; name: string; slug: string; cloudWorkersEnabled: boolean }, OrgDbError>
> {
  await db
    .update(organization)
    .set({ cloudWorkersEnabled })
    .where(eq(organization.id, organizationId));

  const updated = await getOrganizationById(db, organizationId);
  if (!updated) {
    return Result.err(new OrgDbError({ code: "ORG_NOT_FOUND", message: "Organization not found" }));
  }
  return Result.ok(updated);
}

export async function countMembersInOrganization(
  db: Database,
  organizationId: string,
): Promise<number> {
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  return rows.length;
}

export async function getMemberInOrganization(
  db: Database,
  organizationId: string,
  memberId: string,
): Promise<{ id: string; userId: string; role: string } | null> {
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
    })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.id, memberId)))
    .limit(1);
  return rows[0] ?? null;
}
