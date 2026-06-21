import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@openharness/db";
import {
  githubInstallation,
  githubInstallationRepo,
  projectGithubConnection,
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

export async function upsertInstallationForUser(
  db: Database,
  userId: string,
  payload: GithubInstallationPayload,
): Promise<void> {
  const installationId = String(payload.id);
  const accountLogin = payload.account?.login ?? "unknown";
  const accountType = payload.account?.type ?? "User";
  const repositorySelection = payload.repository_selection ?? "selected";

  const existing = await db
    .select({ id: githubInstallation.id, userId: githubInstallation.userId })
    .from(githubInstallation)
    .where(eq(githubInstallation.installationId, installationId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(githubInstallation)
      .set({
        userId,
        accountLogin,
        accountType,
        repositorySelection,
        updatedAt: new Date(),
      })
      .where(eq(githubInstallation.installationId, installationId));
    return;
  }

  await db.insert(githubInstallation).values({
    id: randomUUID(),
    userId,
    installationId,
    accountLogin,
    accountType,
    repositorySelection,
  });
}

export async function deleteInstallation(db: Database, installationId: string): Promise<void> {
  await db
    .delete(githubInstallation)
    .where(eq(githubInstallation.installationId, installationId));
}

export async function syncInstallationRepos(
  db: Database,
  installationId: string,
): Promise<number> {
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
    installationId,
    githubRepoId: String(repo.id),
    owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "",
    name: repo.name,
    fullName: repo.full_name,
  }));

  await db
    .delete(githubInstallationRepo)
    .where(eq(githubInstallationRepo.installationId, installationId));

  if (repoRows.length > 0) {
    await db.insert(githubInstallationRepo).values(repoRows);
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

export async function getUserInstallations(db: Database, userId: string) {
  const installations = await db
    .select({
      id: githubInstallation.id,
      installationId: githubInstallation.installationId,
      accountLogin: githubInstallation.accountLogin,
      accountType: githubInstallation.accountType,
      repositorySelection: githubInstallation.repositorySelection,
      repoCount: sql<number>`cast(count(${githubInstallationRepo.id}) as int)`,
    })
    .from(githubInstallation)
    .leftJoin(
      githubInstallationRepo,
      eq(githubInstallation.installationId, githubInstallationRepo.installationId),
    )
    .where(eq(githubInstallation.userId, userId))
    .groupBy(
      githubInstallation.id,
      githubInstallation.installationId,
      githubInstallation.accountLogin,
      githubInstallation.accountType,
      githubInstallation.repositorySelection,
    );

  return installations.map((row) => ({
    installationId: row.installationId,
    accountLogin: row.accountLogin,
    accountType: row.accountType,
    repositorySelection: row.repositorySelection,
    repoCount: row.repoCount ?? 0,
  }));
}

export async function listUserAccessibleRepos(
  db: Database,
  userId: string,
  query?: string,
  page = 1,
  perPage = 50,
) {
  const installations = await db
    .select({ installationId: githubInstallation.installationId })
    .from(githubInstallation)
    .where(eq(githubInstallation.userId, userId));

  const installationIds = installations.map((row) => row.installationId);
  if (installationIds.length === 0) {
    return { repos: [], total: 0, page, perPage };
  }

  const rows = await db
    .select({
      githubRepoId: githubInstallationRepo.githubRepoId,
      owner: githubInstallationRepo.owner,
      name: githubInstallationRepo.name,
      fullName: githubInstallationRepo.fullName,
      installationId: githubInstallationRepo.installationId,
    })
    .from(githubInstallationRepo)
    .where(inArray(githubInstallationRepo.installationId, installationIds));

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
    githubRepoId: row.githubRepoId,
    owner: row.owner,
    name: row.name,
    fullName: row.fullName,
    installationId: row.installationId,
  }));

  return { repos, total, page, perPage };
}

export async function findRepoInUserInstallations(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
) {
  const fullName = `${owner}/${repo}`.toLowerCase();
  const rows = await db
    .select({
      githubRepoId: githubInstallationRepo.githubRepoId,
      owner: githubInstallationRepo.owner,
      name: githubInstallationRepo.name,
      fullName: githubInstallationRepo.fullName,
      installationId: githubInstallationRepo.installationId,
    })
    .from(githubInstallationRepo)
    .innerJoin(
      githubInstallation,
      eq(githubInstallation.installationId, githubInstallationRepo.installationId),
    )
    .where(
      and(
        eq(githubInstallation.userId, userId),
        sql`lower(${githubInstallationRepo.fullName}) = ${fullName}`,
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getProjectConnection(db: Database, userId: string, projectPath: string) {
  const rows = await db
    .select()
    .from(projectGithubConnection)
    .where(
      and(
        eq(projectGithubConnection.userId, userId),
        eq(projectGithubConnection.projectPath, projectPath),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
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
  userId: string,
  owner: string,
  repo: string,
): Promise<{ defaultBranch: string; branches: string[] }> {
  const repoRecord = await findRepoInUserInstallations(db, userId, owner, repo);
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
