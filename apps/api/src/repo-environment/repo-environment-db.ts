import { randomUUID } from "node:crypto";
import { and, asc, count, eq, type Database } from "@openharness/db";
import {
  projectSourceControlConnection,
  repoEnvironmentVariable,
} from "@openharness/db/schema";
import {
  maskSecretValue,
} from "@openharness/shared/org-secret-slots";
import {
  repoEnvKeyErrorMessage,
  validateRepoEnvKey,
} from "@openharness/shared/repo-environment";
import { Result } from "better-result";
import { decryptSecret, encryptSecret } from "../crypto/secrets.js";
import { RepoEnvironmentError } from "../errors.js";

export type RepoEnvironmentSummary = {
  connectionId: string;
  provider: string;
  namespace: string;
  repoName: string;
  fullName: string;
  variableCount: number;
};

export type RepoEnvironmentVariablePublic = {
  key: string;
  isSecret: boolean;
  value?: string;
  maskedHint?: string;
  description: string | null;
  updatedAt: string;
};

export async function assertRepoConnectionInOrg(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<
  Result<typeof projectSourceControlConnection.$inferSelect, RepoEnvironmentError>
> {
  const rows = await db
    .select()
    .from(projectSourceControlConnection)
    .where(
      and(
        eq(projectSourceControlConnection.id, connectionId),
        eq(projectSourceControlConnection.organizationId, organizationId),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return Result.err(
      new RepoEnvironmentError({
        code: "CONNECTION_NOT_FOUND",
        message: "Repository connection not found",
      }),
    );
  }
  return Result.ok(row);
}

function toPublicVariable(
  row: typeof repoEnvironmentVariable.$inferSelect,
  includePlaintext: boolean,
): RepoEnvironmentVariablePublic {
  const plaintext = decryptSecret(row.valueEncrypted);
  const base = {
    key: row.key,
    isSecret: row.isSecret,
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.isSecret) {
    return {
      ...base,
      maskedHint: maskSecretValue(plaintext),
    };
  }
  if (includePlaintext) {
    return {
      ...base,
      value: plaintext,
    };
  }
  return base;
}

export async function listRepoEnvironmentSummaries(
  db: Database,
  organizationId: string,
): Promise<RepoEnvironmentSummary[]> {
  const rows = await db
    .select({
      connectionId: projectSourceControlConnection.id,
      provider: projectSourceControlConnection.provider,
      namespace: projectSourceControlConnection.namespace,
      repoName: projectSourceControlConnection.name,
      variableCount: count(repoEnvironmentVariable.id),
    })
    .from(projectSourceControlConnection)
    .leftJoin(
      repoEnvironmentVariable,
      eq(
        repoEnvironmentVariable.projectSourceControlConnectionId,
        projectSourceControlConnection.id,
      ),
    )
    .where(eq(projectSourceControlConnection.organizationId, organizationId))
    .groupBy(
      projectSourceControlConnection.id,
      projectSourceControlConnection.provider,
      projectSourceControlConnection.namespace,
      projectSourceControlConnection.name,
    )
    .orderBy(
      asc(projectSourceControlConnection.namespace),
      asc(projectSourceControlConnection.name),
    );

  return rows.map((row) => ({
    connectionId: row.connectionId,
    provider: row.provider,
    namespace: row.namespace,
    repoName: row.repoName,
    fullName: `${row.namespace}/${row.repoName}`,
    variableCount: Number(row.variableCount),
  }));
}

export async function listRepoEnvironmentVariables(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<Result<RepoEnvironmentVariablePublic[], RepoEnvironmentError>> {
  const connectionResult = await assertRepoConnectionInOrg(
    db,
    organizationId,
    connectionId,
  );
  if (Result.isError(connectionResult)) return Result.err(connectionResult.error);

  const rows = await db
    .select()
    .from(repoEnvironmentVariable)
    .where(
      and(
        eq(repoEnvironmentVariable.organizationId, organizationId),
        eq(repoEnvironmentVariable.projectSourceControlConnectionId, connectionId),
      ),
    )
    .orderBy(repoEnvironmentVariable.key);

  return Result.ok(rows.map((row) => toPublicVariable(row, true)));
}

export async function upsertRepoEnvironmentVariable(
  db: Database,
  organizationId: string,
  userId: string,
  connectionId: string,
  keyInput: string,
  options: {
    value: string;
    isSecret: boolean;
    description?: string | null;
  },
): Promise<Result<RepoEnvironmentVariablePublic, RepoEnvironmentError>> {
  const connectionResult = await assertRepoConnectionInOrg(
    db,
    organizationId,
    connectionId,
  );
  if (Result.isError(connectionResult)) return Result.err(connectionResult.error);

  const keyResult = validateRepoEnvKey(keyInput);
  if (!keyResult.ok) {
    return Result.err(
      new RepoEnvironmentError({
        code: "INVALID_KEY",
        message: repoEnvKeyErrorMessage(keyResult.error),
      }),
    );
  }

  const value = options.value.trim();
  if (!value) {
    return Result.err(
      new RepoEnvironmentError({
        code: "INVALID_VALUE",
        message: "Variable value cannot be empty",
      }),
    );
  }

  const key = keyResult.normalized;
  const encrypted = encryptSecret(value);
  const description =
    typeof options.description === "string" && options.description.trim()
      ? options.description.trim()
      : null;
  const now = new Date();

  const existing = await db
    .select({ id: repoEnvironmentVariable.id })
    .from(repoEnvironmentVariable)
    .where(
      and(
        eq(repoEnvironmentVariable.projectSourceControlConnectionId, connectionId),
        eq(repoEnvironmentVariable.key, key),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(repoEnvironmentVariable)
      .set({
        valueEncrypted: encrypted,
        isSecret: options.isSecret,
        description,
        updatedByUserId: userId,
        updatedAt: now,
      })
      .where(eq(repoEnvironmentVariable.id, existing[0].id));
  } else {
    await db.insert(repoEnvironmentVariable).values({
      id: randomUUID(),
      organizationId,
      projectSourceControlConnectionId: connectionId,
      key,
      valueEncrypted: encrypted,
      isSecret: options.isSecret,
      description,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  return Result.ok(
    options.isSecret
      ? {
          key,
          isSecret: true,
          maskedHint: maskSecretValue(value),
          description,
          updatedAt: now.toISOString(),
        }
      : {
          key,
          isSecret: false,
          value,
          description,
          updatedAt: now.toISOString(),
        },
  );
}

export async function deleteRepoEnvironmentVariable(
  db: Database,
  organizationId: string,
  connectionId: string,
  keyInput: string,
): Promise<Result<boolean, RepoEnvironmentError>> {
  const connectionResult = await assertRepoConnectionInOrg(
    db,
    organizationId,
    connectionId,
  );
  if (Result.isError(connectionResult)) return Result.err(connectionResult.error);

  const keyResult = validateRepoEnvKey(keyInput);
  if (!keyResult.ok) {
    return Result.err(
      new RepoEnvironmentError({
        code: "INVALID_KEY",
        message: repoEnvKeyErrorMessage(keyResult.error),
      }),
    );
  }

  const rows = await db
    .delete(repoEnvironmentVariable)
    .where(
      and(
        eq(repoEnvironmentVariable.organizationId, organizationId),
        eq(repoEnvironmentVariable.projectSourceControlConnectionId, connectionId),
        eq(repoEnvironmentVariable.key, keyResult.normalized),
      ),
    )
    .returning({ id: repoEnvironmentVariable.id });

  return Result.ok(rows.length > 0);
}

export async function resolveRepoEnvironmentVariables(
  db: Database,
  organizationId: string,
  connectionId: string,
): Promise<Result<Record<string, string>, RepoEnvironmentError>> {
  const connectionResult = await assertRepoConnectionInOrg(
    db,
    organizationId,
    connectionId,
  );
  if (Result.isError(connectionResult)) return Result.err(connectionResult.error);

  const rows = await db
    .select()
    .from(repoEnvironmentVariable)
    .where(
      and(
        eq(repoEnvironmentVariable.organizationId, organizationId),
        eq(repoEnvironmentVariable.projectSourceControlConnectionId, connectionId),
      ),
    );

  const vars: Record<string, string> = {};
  for (const row of rows) {
    vars[row.key] = decryptSecret(row.valueEncrypted);
  }
  return Result.ok(vars);
}
