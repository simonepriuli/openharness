import { randomUUID } from "node:crypto";
import { and, eq, type Database } from "@openharness/db";
import { organizationSecret } from "@openharness/db/schema";
import {
  ORG_SECRET_SLOTS,
  type OrgSecretSlot,
  isOrgSecretSlot,
  maskSecretValue,
} from "@openharness/shared/org-secret-slots";
import { Result } from "better-result";
import { decryptSecret, encryptSecret } from "../crypto/secrets.js";
import { OrgSecretsError } from "../errors.js";

export type OrgSecretStatus = {
  slot: OrgSecretSlot;
  displayName: string;
  configured: boolean;
  maskedHint?: string;
  updatedAt?: string;
};

export type ResolvedOrgSecret = {
  slot: OrgSecretSlot;
  value: string;
};

function assertValidSlot(slot: string): Result<OrgSecretSlot, OrgSecretsError> {
  if (!isOrgSecretSlot(slot)) {
    return Result.err(
      new OrgSecretsError({ code: "INVALID_SLOT", message: `Unknown secret slot: ${slot}` }),
    );
  }
  return Result.ok(slot);
}

export async function listOrgSecretStatus(
  db: Database,
  organizationId: string,
): Promise<OrgSecretStatus[]> {
  const rows = await db
    .select()
    .from(organizationSecret)
    .where(eq(organizationSecret.organizationId, organizationId));

  const bySlot = new Map(rows.map((row) => [row.slot, row]));

  return ORG_SECRET_SLOTS.map((slot) => {
    const row = bySlot.get(slot);
    if (!row) {
      return {
        slot,
        displayName: slot,
        configured: false,
      };
    }
    const plaintext = decryptSecret(row.valueEncrypted);
    return {
      slot,
      displayName: slot,
      configured: true,
      maskedHint: maskSecretValue(plaintext),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function upsertOrgSecret(
  db: Database,
  organizationId: string,
  userId: string,
  slotInput: string,
  plaintext: string,
): Promise<Result<OrgSecretStatus, OrgSecretsError>> {
  const slotResult = assertValidSlot(slotInput);
  if (Result.isError(slotResult)) return slotResult;
  const slot = slotResult.value;

  const value = plaintext.trim();
  if (!value) {
    return Result.err(
      new OrgSecretsError({ code: "INVALID_VALUE", message: "Secret value cannot be empty" }),
    );
  }

  const encrypted = encryptSecret(value);
  const existing = await db
    .select({ id: organizationSecret.id })
    .from(organizationSecret)
    .where(
      and(
        eq(organizationSecret.organizationId, organizationId),
        eq(organizationSecret.slot, slot),
      ),
    )
    .limit(1);

  const now = new Date();
  if (existing[0]) {
    await db
      .update(organizationSecret)
      .set({
        valueEncrypted: encrypted,
        updatedByUserId: userId,
        updatedAt: now,
      })
      .where(eq(organizationSecret.id, existing[0].id));
  } else {
    await db.insert(organizationSecret).values({
      id: randomUUID(),
      organizationId,
      slot,
      valueEncrypted: encrypted,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  return Result.ok({
    slot,
    displayName: slot,
    configured: true,
    maskedHint: maskSecretValue(value),
    updatedAt: now.toISOString(),
  });
}

export async function deleteOrgSecret(
  db: Database,
  organizationId: string,
  slotInput: string,
): Promise<Result<boolean, OrgSecretsError>> {
  const slotResult = assertValidSlot(slotInput);
  if (Result.isError(slotResult)) return slotResult;
  const slot = slotResult.value;

  const rows = await db
    .delete(organizationSecret)
    .where(
      and(
        eq(organizationSecret.organizationId, organizationId),
        eq(organizationSecret.slot, slot),
      ),
    )
    .returning({ id: organizationSecret.id });
  return Result.ok(rows.length > 0);
}

export async function resolveOrgSecrets(
  db: Database,
  organizationId: string,
): Promise<ResolvedOrgSecret[]> {
  const rows = await db
    .select()
    .from(organizationSecret)
    .where(eq(organizationSecret.organizationId, organizationId));

  const resolved: ResolvedOrgSecret[] = [];
  for (const row of rows) {
    if (!isOrgSecretSlot(row.slot)) continue;
    resolved.push({
      slot: row.slot,
      value: decryptSecret(row.valueEncrypted),
    });
  }
  return resolved;
}
