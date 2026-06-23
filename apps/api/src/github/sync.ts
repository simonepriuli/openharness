import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, type Database } from "@openharness/db";
import {
  sourceControlConnection,
  sourceControlRepo,
  type SourceControlProvider,
} from "@openharness/db/schema";
import { githubAppFetch } from "./app-auth.js";

export type GithubInstallationPayload = {
  id: number;
  account?: { login?: string; type?: string } | null;
  repository_selection?: string;
};

export type GithubRepoPayload = {
  id: number;
  name: string;
  full_name: string;
  owner?: { login?: string };
};

const GITHUB_PROVIDER: SourceControlProvider = "github";

function githubMetadata(payload: GithubInstallationPayload) {
  return {
    accountType: payload.account?.type ?? "User",
    repositorySelection: payload.repository_selection ?? "selected",
    installationId: String(payload.id),
  };
}

export async function upsertInstallationForOrg(
  db: Database,
  organizationId: string,
  userId: string,
  payload: GithubInstallationPayload,
): Promise<string> {
  const installationId = String(payload.id);
  const accountLogin = payload.account?.login ?? "unknown";
  const metadata = githubMetadata(payload);

  const existing = await db
    .select({ id: sourceControlConnection.id })
    .from(sourceControlConnection)
    .where(
      and(
        eq(sourceControlConnection.provider, GITHUB_PROVIDER),
        eq(sourceControlConnection.externalOrgId, installationId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(sourceControlConnection)
      .set({
        organizationId,
        userId,
        displayName: accountLogin,
        metadata,
        updatedAt: new Date(),
      })
      .where(eq(sourceControlConnection.id, existing[0].id));
    return existing[0].id;
  }

  const connectionId = randomUUID();
  await db.insert(sourceControlConnection).values({
    id: connectionId,
    provider: GITHUB_PROVIDER,
    organizationId,
    userId,
    externalOrgId: installationId,
    displayName: accountLogin,
    metadata,
  });
  return connectionId;
}

export async function deleteInstallation(db: Database, installationId: string): Promise<void> {
  await db
    .delete(sourceControlConnection)
    .where(
      and(
        eq(sourceControlConnection.provider, GITHUB_PROVIDER),
        eq(sourceControlConnection.externalOrgId, installationId),
      ),
    );
}

export async function getConnectionIdForInstallation(
  db: Database,
  installationId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: sourceControlConnection.id })
    .from(sourceControlConnection)
    .where(
      and(
        eq(sourceControlConnection.provider, GITHUB_PROVIDER),
        eq(sourceControlConnection.externalOrgId, installationId),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function syncInstallationRepos(
  db: Database,
  installationId: string,
): Promise<number> {
  const connectionId = await getConnectionIdForInstallation(db, installationId);
  if (!connectionId) {
    throw new Error(`No connection found for installation ${installationId}`);
  }

  const repos: GithubRepoPayload[] = [];
  let page = 1;

  while (true) {
    const response = await githubAppFetch(
      `/installation/repositories?per_page=100&page=${page}`,
      { installationId },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to list installation repos: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { repositories?: GithubRepoPayload[] };
    const batch = data.repositories ?? [];
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  const repoRows = repos.map((repo) => ({
    id: randomUUID(),
    connectionId,
    externalRepoId: String(repo.id),
    namespace: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "",
    name: repo.name,
    fullName: repo.full_name,
    metadata: { installationId },
  }));

  await db
    .delete(sourceControlRepo)
    .where(eq(sourceControlRepo.connectionId, connectionId));

  if (repoRows.length > 0) {
    await db.insert(sourceControlRepo).values(repoRows);
  }

  return repoRows.length;
}

export async function fetchInstallationFromGithub(
  installationId: string,
): Promise<GithubInstallationPayload> {
  const response = await githubAppFetch(`/app/installations/${installationId}`);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to fetch installation: ${response.status} ${text}`);
  }
  return (await response.json()) as GithubInstallationPayload;
}

export async function getOrgInstallations(db: Database, organizationId: string) {
  const installations = await db
    .select({
      id: sourceControlConnection.id,
      installationId: sourceControlConnection.externalOrgId,
      accountLogin: sourceControlConnection.displayName,
      metadata: sourceControlConnection.metadata,
      repoCount: sql<number>`cast(count(${sourceControlRepo.id}) as int)`,
    })
    .from(sourceControlConnection)
    .leftJoin(sourceControlRepo, eq(sourceControlConnection.id, sourceControlRepo.connectionId))
    .where(
      and(
        eq(sourceControlConnection.organizationId, organizationId),
        eq(sourceControlConnection.provider, GITHUB_PROVIDER),
      ),
    )
    .groupBy(
      sourceControlConnection.id,
      sourceControlConnection.externalOrgId,
      sourceControlConnection.displayName,
      sourceControlConnection.metadata,
    );

  return installations.map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, string>;
    return {
      connectionId: row.id,
      installationId: row.installationId,
      accountLogin: row.accountLogin,
      accountType: meta.accountType ?? "User",
      repositorySelection: meta.repositorySelection ?? "selected",
      repoCount: row.repoCount ?? 0,
    };
  });
}

export async function listOrgAccessibleRepos(
  db: Database,
  organizationId: string,
  query?: string,
  page = 1,
  perPage = 50,
  provider: SourceControlProvider = GITHUB_PROVIDER,
) {
  const connections = await db
    .select({ id: sourceControlConnection.id, externalOrgId: sourceControlConnection.externalOrgId })
    .from(sourceControlConnection)
    .where(
      and(
        eq(sourceControlConnection.organizationId, organizationId),
        eq(sourceControlConnection.provider, provider),
      ),
    );

  const connectionIds = connections.map((row) => row.id);
  if (connectionIds.length === 0) {
    return { repos: [], total: 0, page, perPage };
  }

  const externalOrgByConnection = new Map(connections.map((row) => [row.id, row.externalOrgId]));

  const rows = await db
    .select({
      externalRepoId: sourceControlRepo.externalRepoId,
      namespace: sourceControlRepo.namespace,
      name: sourceControlRepo.name,
      fullName: sourceControlRepo.fullName,
      connectionId: sourceControlRepo.connectionId,
    })
    .from(sourceControlRepo)
    .where(inArray(sourceControlRepo.connectionId, connectionIds));

  const normalizedQuery = query?.trim().toLowerCase();
  const filtered = normalizedQuery
    ? rows.filter(
        (row) =>
          row.fullName.toLowerCase().includes(normalizedQuery) ||
          row.name.toLowerCase().includes(normalizedQuery),
      )
    : rows;

  const total = filtered.length;
  const offset = (page - 1) * perPage;
  const repos = filtered.slice(offset, offset + perPage).map((row) => ({
    provider,
    externalRepoId: row.externalRepoId,
    githubRepoId: row.externalRepoId,
    owner: row.namespace,
    namespace: row.namespace,
    name: row.name,
    fullName: row.fullName,
    installationId: externalOrgByConnection.get(row.connectionId) ?? "",
    connectionId: row.connectionId,
  }));

  return { repos, total, page, perPage };
}

export async function findRepoInOrgInstallations(
  db: Database,
  organizationId: string,
  owner: string,
  repo: string,
) {
  const fullName = `${owner}/${repo}`.toLowerCase();
  const rows = await db
    .select({
      externalRepoId: sourceControlRepo.externalRepoId,
      namespace: sourceControlRepo.namespace,
      name: sourceControlRepo.name,
      fullName: sourceControlRepo.fullName,
      installationId: sourceControlConnection.externalOrgId,
      connectionId: sourceControlConnection.id,
    })
    .from(sourceControlRepo)
    .innerJoin(
      sourceControlConnection,
      eq(sourceControlConnection.id, sourceControlRepo.connectionId),
    )
    .where(
      and(
        eq(sourceControlConnection.organizationId, organizationId),
        eq(sourceControlConnection.provider, GITHUB_PROVIDER),
        sql`lower(${sourceControlRepo.fullName}) = ${fullName}`,
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    githubRepoId: row.externalRepoId,
    externalRepoId: row.externalRepoId,
    owner: row.namespace,
    namespace: row.namespace,
    name: row.name,
    fullName: row.fullName,
    installationId: row.installationId,
    connectionId: row.connectionId,
  };
}

export function parseGithubRemoteOwnerRepo(
  remoteUrl: string | null | undefined,
): { owner: string; repo: string } | null {
  if (!remoteUrl?.trim()) return null;
  const url = remoteUrl.trim();

  const sshMatch = url.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return { owner: sshMatch[1]!, repo: sshMatch[2]!.replace(/\.git$/i, "") };
  }

  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("github.com")) return null;
    const parts = parsed.pathname.replace(/^\//, "").replace(/\.git$/i, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export async function listRepoBranches(
  db: Database,
  organizationId: string,
  owner: string,
  repo: string,
): Promise<{ defaultBranch: string; branches: string[] }> {
  const repoRecord = await findRepoInOrgInstallations(db, organizationId, owner, repo);
  if (!repoRecord) {
    throw new Error("repo_not_accessible");
  }

  const repoResponse = await githubAppFetch(`/repos/${owner}/${repo}`, {
    installationId: repoRecord.installationId,
  });
  if (!repoResponse.ok) {
    const text = await repoResponse.text().catch(() => "");
    throw new Error(`Failed to fetch repo: ${repoResponse.status} ${text}`);
  }

  const repoData = (await repoResponse.json()) as { default_branch?: string };
  const defaultBranch = repoData.default_branch ?? "main";

  const branches: string[] = [];
  let page = 1;
  while (true) {
    const response = await githubAppFetch(
      `/repos/${owner}/${repo}/branches?per_page=100&page=${page}`,
      { installationId: repoRecord.installationId },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Failed to list branches: ${response.status} ${text}`);
    }

    const batch = (await response.json()) as Array<{ name: string }>;
    branches.push(...batch.map((row) => row.name));
    if (batch.length < 100) break;
    page += 1;
  }

  return { defaultBranch, branches };
}

export function remoteMismatchWarning(
  detectedRemoteUrl: string | null | undefined,
  owner: string,
  repo: string,
): string | null {
  const detected = parseGithubRemoteOwnerRepo(detectedRemoteUrl);
  if (!detected) return null;
  if (
    detected.owner.toLowerCase() === owner.toLowerCase() &&
    detected.repo.toLowerCase() === repo.toLowerCase()
  ) {
    return null;
  }
  return `Local git origin points to ${detected.owner}/${detected.repo}, but you linked ${owner}/${repo}.`;
}

export const getUserInstallations = getOrgInstallations;
export const listUserAccessibleRepos = listOrgAccessibleRepos;
export const findRepoInUserInstallations = findRepoInOrgInstallations;
export const upsertInstallationForUser = upsertInstallationForOrg;
