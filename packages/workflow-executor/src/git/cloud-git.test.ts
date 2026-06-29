import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  buildAuthenticatedRemoteUrl,
  createCloudGitOps,
  ensureRepoClone,
  isGitRepository,
  runGit,
} from "./cloud-git.js";

const hasGit = await runGit(process.cwd(), ["--version"])
  .then(() => true)
  .catch(() => false);

describe("createCloudGitOps", () => {
  it("reuses workflow git worktree helpers", async () => {
    const git = createCloudGitOps({ worktreesRoot: "/tmp/worktrees" });
    assert.equal(typeof git.preparePrWorktree, "function");
    assert.equal(typeof git.prepareBranchWorktree, "function");
    assert.equal(typeof git.isGitRepository, "function");
  });
});

describe("ensureRepoClone", { skip: !hasGit }, () => {
  const reposRoot = join(tmpdir(), `openharness-cloud-git-${Date.now()}`);
  const organizationId = "org-test";
  const connectionId = "conn-test";

  after(async () => {
    await rm(reposRoot, { recursive: true, force: true });
  });

  it("clones a public repository on first use", async () => {
    const repoDir = await ensureRepoClone({
      reposRoot,
      organizationId,
      connectionId,
      credentials: {
        username: "x-access-token",
        token: "public",
        remoteUrl: "https://github.com/octocat/Hello-World.git",
      },
    });

    assert.equal(await isGitRepository(repoDir), true);
    assert.match(repoDir, new RegExp(`${organizationId}/${connectionId}$`));

    const second = await ensureRepoClone({
      reposRoot,
      organizationId,
      connectionId,
      credentials: {
        username: "x-access-token",
        token: "public",
        remoteUrl: "https://github.com/octocat/Hello-World.git",
      },
    });
    assert.equal(second, repoDir);
  });
});

describe("buildAuthenticatedRemoteUrl", () => {
  it("embeds credentials in https remote url", () => {
    const url = buildAuthenticatedRemoteUrl(
      "https://github.com/acme/repo.git",
      "x-access-token",
      "secret",
    );
    assert.match(url, /^https:\/\/x-access-token:secret@github\.com\/acme\/repo\.git$/);
  });
});
