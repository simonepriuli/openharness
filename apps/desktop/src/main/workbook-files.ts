import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { join, normalize, resolve } from "node:path";
import fg from "fast-glob";
import type { AttachedRoot } from "../shared/path-grants.js";
import {
  readWorkbookFileAtPath,
  resolveWorkbookPath,
} from "./workbook-paths.js";

export { workbookDisplayName } from "./workbook-paths.js";
export { resolveWorkbookPath, resolveWorkbookRelativePath } from "./workbook-paths.js";

const execFileAsync = promisify(execFile);

export const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024;
export const MAX_WORKBOOK_LIST = 200;

export type ReadWorkbookFileError =
  | "not_found"
  | "outside_project"
  | "too_large"
  | "not_xlsx"
  | "directory";

export type ReadWorkbookFileResult =
  | { ok: true; relativePath: string; mtimeMs: number; base64: string }
  | { ok: false; relativePath: string; error: ReadWorkbookFileError };

export type OpenWorkbookWithTarget =
  | "default"
  | "microsoft-excel"
  | "numbers"
  | "libreoffice-calc";

export type WorkbookOpenWithOption = {
  id: OpenWorkbookWithTarget;
  label: string;
  iconDataUrl?: string;
};

type WorkbookOpenWithCandidate = {
  id: Exclude<OpenWorkbookWithTarget, "default">;
  label: string;
  resolvePath: () => Promise<string | null>;
};

export async function readWorkbookFile(
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): Promise<ReadWorkbookFileResult> {
  const resolved = resolveWorkbookPath(cwd, relativePath, grants);
  if (!resolved) {
    return {
      ok: false,
      relativePath,
      error: relativePath.toLowerCase().endsWith(".xlsx") ? "outside_project" : "not_xlsx",
    };
  }

  const result = await readWorkbookFileAtPath(resolved.absolutePath, resolved.pathKey);
  if (!result.ok) {
    return {
      ok: false,
      relativePath: result.relativePath,
      error: result.error === "directory" ? "directory" : result.error,
    };
  }
  return result;
}

export async function listWorkbookFiles(cwd: string): Promise<string[]> {
  const normalizedCwd = resolve(cwd);
  if (!existsSync(normalizedCwd)) {
    return [];
  }

  const matches = await fg("**/*.xlsx", {
    cwd: normalizedCwd,
    onlyFiles: true,
    unique: true,
    dot: false,
    suppressErrors: true,
  });

  return matches
    .map((match) => normalize(match).replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_WORKBOOK_LIST);
}

const MAC_OPEN_WITH_APPS: Record<Exclude<OpenWorkbookWithTarget, "default">, string> = {
  "microsoft-excel": "Microsoft Excel",
  numbers: "Numbers",
  "libreoffice-calc": "LibreOffice",
};

export function resolveMacAppBundlePath(appName: string): string | null {
  const home = homedir();
  const candidates = [
    join("/Applications", `${appName}.app`),
    join("/System/Applications", `${appName}.app`),
    join(home, "Applications", `${appName}.app`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function resolveWindowsExcelPath(): Promise<string | null> {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const candidates = [
    programFiles ? join(programFiles, "Microsoft Office", "root", "Office16", "EXCEL.EXE") : null,
    programFilesX86
      ? join(programFilesX86, "Microsoft Office", "root", "Office16", "EXCEL.EXE")
      : null,
    "C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
    "C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const { stdout } = await execFileAsync("where", ["excel"], { windowsHide: true });
    const first = stdout.trim().split(/\r?\n/).find(Boolean);
    if (first && existsSync(first)) {
      return first;
    }
  } catch {
    // Excel not on PATH.
  }
  return null;
}

export async function resolveLinuxLibreOfficePath(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("which", ["libreoffice"]);
    const resolved = stdout.trim();
    return resolved || null;
  } catch {
    return null;
  }
}

function workbookOpenWithCandidates(): WorkbookOpenWithCandidate[] {
  if (process.platform === "darwin") {
    return [
      {
        id: "microsoft-excel",
        label: "Microsoft Excel",
        resolvePath: async () => resolveMacAppBundlePath("Microsoft Excel"),
      },
      {
        id: "numbers",
        label: "Numbers",
        resolvePath: async () => resolveMacAppBundlePath("Numbers"),
      },
      {
        id: "libreoffice-calc",
        label: "LibreOffice Calc",
        resolvePath: async () => resolveMacAppBundlePath("LibreOffice"),
      },
    ];
  }

  if (process.platform === "win32") {
    return [
      {
        id: "microsoft-excel",
        label: "Microsoft Excel",
        resolvePath: resolveWindowsExcelPath,
      },
    ];
  }

  return [
    {
      id: "libreoffice-calc",
      label: "LibreOffice Calc",
      resolvePath: resolveLinuxLibreOfficePath,
    },
  ];
}

export async function listWorkbookOpenWithApps(): Promise<WorkbookOpenWithOption[]> {
  // NOTE: We intentionally do not extract native OS app icons here. Calling
  // Electron's `app.getFileIcon()` / `nativeImage` PNG path crashes the main
  // process on macOS 26 + Electron 36 (fatal V8/rust_png SIGTRAP). The renderer
  // shows a built-in icon instead.
  const options: WorkbookOpenWithOption[] = [];

  for (const candidate of workbookOpenWithCandidates()) {
    const executablePath = await candidate.resolvePath();
    if (!executablePath) {
      continue;
    }
    options.push({
      id: candidate.id,
      label: candidate.label,
    });
  }

  return options;
}

export async function openWorkbookWith(
  cwd: string,
  relativePath: string,
  target: OpenWorkbookWithTarget,
  grants: AttachedRoot[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolved = resolveWorkbookPath(cwd, relativePath, grants);
  if (!resolved) {
    return { ok: false, error: "Workbook path is outside the workspace." };
  }
  if (!existsSync(resolved.absolutePath)) {
    return { ok: false, error: "Workbook not found." };
  }

  if (target === "default") {
    const { shell } = await import("electron");
    const result = await shell.openPath(resolved.absolutePath);
    if (result) {
      return { ok: false, error: result };
    }
    return { ok: true };
  }

  if (process.platform === "darwin") {
    const appName = MAC_OPEN_WITH_APPS[target];
    try {
      await execFileAsync("open", ["-a", appName, resolved.absolutePath]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : `Failed to open with ${appName}.`,
      };
    }
  }

  if (process.platform === "win32" && target === "microsoft-excel") {
    try {
      await execFileAsync("cmd.exe", ["/c", "start", "", "excel", resolved.absolutePath], {
        windowsHide: true,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to open with Microsoft Excel.",
      };
    }
  }

  if (process.platform === "linux" && target === "libreoffice-calc") {
    try {
      await execFileAsync("libreoffice", ["--calc", resolved.absolutePath]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to open with LibreOffice Calc.",
      };
    }
  }

  const { shell } = await import("electron");
  const fallback = await shell.openPath(resolved.absolutePath);
  if (fallback) {
    return { ok: false, error: fallback };
  }
  return { ok: true };
}
