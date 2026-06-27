import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function buildAuthenticatedRemoteUrl(remoteUrl: string, username: string, token: string): string {
  return remoteUrl.replace(
    /^https:\/\//,
    `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@`,
  );
}

async function runGit(
  cwd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 20 * 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

async function currentBranch(cwd: string): Promise<string> {
  const { stdout } = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = stdout.trim();
  if (!branch) throw new Error("Could not determine current git branch");
  return branch;
}

async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const { stdout } = await runGit(cwd, ["status", "--porcelain"]);
  return stdout.trim().length > 0;
}

export async function pushCurrentBranch(
  cwd: string,
  credentials: { username: string; token: string; remoteUrl: string },
  options: { commitMessage?: string; headRef?: string },
): Promise<{ branch: string; committed: boolean }> {
  const branch = options.headRef?.trim() || (await currentBranch(cwd));
  let committed = false;

  if (await hasUncommittedChanges(cwd)) {
    await runGit(cwd, ["add", "-A"]);
    await runGit(cwd, [
      "commit",
      "-m",
      options.commitMessage?.trim() || "OpenHarness agent changes",
    ]);
    committed = true;
  }

  const authRemote = buildAuthenticatedRemoteUrl(
    credentials.remoteUrl,
    credentials.username,
    credentials.token,
  );
  await runGit(cwd, ["remote", "set-url", "origin", authRemote]);
  await runGit(cwd, ["push", "origin", `HEAD:refs/heads/${branch}`]);

  return { branch, committed };
}
