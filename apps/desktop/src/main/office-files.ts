import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";
import { join, normalize, resolve } from "node:path";
import fg from "fast-glob";
import type { AttachedRoot } from "../shared/path-grants.js";
import {
  officeFileKindFromPath,
  readOfficeFileAtPath,
  resolveOfficeFilePath,
  type OfficeFileKind,
} from "./office-paths.js";

export {
  officeDisplayName,
  officeFileKindFromPath,
  resolveOfficeFilePath,
  resolveOfficeRelativePath,
} from "./office-paths.js";

const execFileAsync = promisify(execFile);

export const MAX_OFFICE_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_OFFICE_FILE_LIST = 200;

export type ReadOfficeFileError =
  | "not_found"
  | "outside_project"
  | "too_large"
  | "not_office_file"
  | "directory";

export type ReadOfficeFileResult =
  | { ok: true; relativePath: string; mtimeMs: number; base64: string; kind: OfficeFileKind }
  | { ok: false; relativePath: string; error: ReadOfficeFileError };

export type OpenOfficeWithTarget =
  | "default"
  | "microsoft-excel"
  | "numbers"
  | "libreoffice-calc"
  | "microsoft-word"
  | "pages"
  | "libreoffice-writer";

export type OfficeOpenWithOption = {
  id: OpenOfficeWithTarget;
  label: string;
  iconDataUrl?: string;
};

type OfficeOpenWithCandidate = {
  id: Exclude<OpenOfficeWithTarget, "default">;
  label: string;
  kinds: OfficeFileKind[];
  resolvePath: () => Promise<string | null>;
};

export async function readOfficeFile(
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): Promise<ReadOfficeFileResult> {
  const resolved = resolveOfficeFilePath(cwd, relativePath, grants);
  if (!resolved) {
    return {
      ok: false,
      relativePath,
      error: officeFileKindFromPath(relativePath) ? "outside_project" : "not_office_file",
    };
  }

  const result = await readOfficeFileAtPath(resolved.absolutePath, resolved.pathKey);
  if (!result.ok) {
    return {
      ok: false,
      relativePath: result.relativePath,
      error: result.error === "directory" ? "directory" : result.error,
    };
  }
  return { ...result, kind: resolved.kind };
}

export async function listOfficeFiles(cwd: string): Promise<string[]> {
  const normalizedCwd = resolve(cwd);
  if (!existsSync(normalizedCwd)) {
    return [];
  }

  const matches = await fg("**/*.{xlsx,docx}", {
    cwd: normalizedCwd,
    onlyFiles: true,
    unique: true,
    dot: false,
    suppressErrors: true,
  });

  return matches
    .map((match) => normalize(match).replace(/\\/g, "/"))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, MAX_OFFICE_FILE_LIST);
}

const MAC_OPEN_WITH_APPS: Record<Exclude<OpenOfficeWithTarget, "default">, string> = {
  "microsoft-excel": "Microsoft Excel",
  numbers: "Numbers",
  "libreoffice-calc": "LibreOffice",
  "microsoft-word": "Microsoft Word",
  pages: "Pages",
  "libreoffice-writer": "LibreOffice",
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

export async function resolveWindowsWordPath(): Promise<string | null> {
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  const candidates = [
    programFiles ? join(programFiles, "Microsoft Office", "root", "Office16", "WINWORD.EXE") : null,
    programFilesX86
      ? join(programFilesX86, "Microsoft Office", "root", "Office16", "WINWORD.EXE")
      : null,
    "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    "C:\\Program Files (x86)\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const { stdout } = await execFileAsync("where", ["winword"], { windowsHide: true });
    const first = stdout.trim().split(/\r?\n/).find(Boolean);
    if (first && existsSync(first)) {
      return first;
    }
  } catch {
    // Word not on PATH.
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

function officeOpenWithCandidates(): OfficeOpenWithCandidate[] {
  if (process.platform === "darwin") {
    return [
      {
        id: "microsoft-excel",
        label: "Microsoft Excel",
        kinds: ["xlsx"],
        resolvePath: async () => resolveMacAppBundlePath("Microsoft Excel"),
      },
      {
        id: "numbers",
        label: "Numbers",
        kinds: ["xlsx"],
        resolvePath: async () => resolveMacAppBundlePath("Numbers"),
      },
      {
        id: "libreoffice-calc",
        label: "LibreOffice Calc",
        kinds: ["xlsx"],
        resolvePath: async () => resolveMacAppBundlePath("LibreOffice"),
      },
      {
        id: "microsoft-word",
        label: "Microsoft Word",
        kinds: ["docx"],
        resolvePath: async () => resolveMacAppBundlePath("Microsoft Word"),
      },
      {
        id: "pages",
        label: "Pages",
        kinds: ["docx"],
        resolvePath: async () => resolveMacAppBundlePath("Pages"),
      },
      {
        id: "libreoffice-writer",
        label: "LibreOffice Writer",
        kinds: ["docx"],
        resolvePath: async () => resolveMacAppBundlePath("LibreOffice"),
      },
    ];
  }

  if (process.platform === "win32") {
    return [
      {
        id: "microsoft-excel",
        label: "Microsoft Excel",
        kinds: ["xlsx"],
        resolvePath: resolveWindowsExcelPath,
      },
      {
        id: "microsoft-word",
        label: "Microsoft Word",
        kinds: ["docx"],
        resolvePath: resolveWindowsWordPath,
      },
    ];
  }

  return [
    {
      id: "libreoffice-calc",
      label: "LibreOffice Calc",
      kinds: ["xlsx"],
      resolvePath: resolveLinuxLibreOfficePath,
    },
    {
      id: "libreoffice-writer",
      label: "LibreOffice Writer",
      kinds: ["docx"],
      resolvePath: resolveLinuxLibreOfficePath,
    },
  ];
}

export async function listOfficeOpenWithApps(
  kind?: OfficeFileKind,
): Promise<OfficeOpenWithOption[]> {
  const options: OfficeOpenWithOption[] = [];

  for (const candidate of officeOpenWithCandidates()) {
    if (kind && !candidate.kinds.includes(kind)) {
      continue;
    }
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

export async function openOfficeWith(
  cwd: string,
  relativePath: string,
  target: OpenOfficeWithTarget,
  grants: AttachedRoot[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolved = resolveOfficeFilePath(cwd, relativePath, grants);
  if (!resolved) {
    return { ok: false, error: "Document path is outside the workspace." };
  }
  if (!existsSync(resolved.absolutePath)) {
    return { ok: false, error: "Document not found." };
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

  if (process.platform === "win32" && target === "microsoft-word") {
    try {
      await execFileAsync("cmd.exe", ["/c", "start", "", "winword", resolved.absolutePath], {
        windowsHide: true,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to open with Microsoft Word.",
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

  if (process.platform === "linux" && target === "libreoffice-writer") {
    try {
      await execFileAsync("libreoffice", ["--writer", resolved.absolutePath]);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to open with LibreOffice Writer.",
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

// Backward-compatible workbook aliases
export const MAX_WORKBOOK_BYTES = MAX_OFFICE_FILE_BYTES;
export const MAX_WORKBOOK_LIST = MAX_OFFICE_FILE_LIST;
export type ReadWorkbookFileError = ReadOfficeFileError;
export type ReadWorkbookFileResult = ReadOfficeFileResult;
export type OpenWorkbookWithTarget = OpenOfficeWithTarget;
export type WorkbookOpenWithOption = OfficeOpenWithOption;

export async function readWorkbookFile(
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): Promise<ReadWorkbookFileResult> {
  return readOfficeFile(cwd, relativePath, grants);
}

export async function listWorkbookFiles(cwd: string): Promise<string[]> {
  const paths = await listOfficeFiles(cwd);
  return paths.filter((path) => path.toLowerCase().endsWith(".xlsx"));
}

export async function listWorkbookOpenWithApps(): Promise<WorkbookOpenWithOption[]> {
  return listOfficeOpenWithApps("xlsx");
}

export async function openWorkbookWith(
  cwd: string,
  relativePath: string,
  target: OpenWorkbookWithTarget,
  grants: AttachedRoot[] = [],
): Promise<{ ok: true } | { ok: false; error: string }> {
  return openOfficeWith(cwd, relativePath, target, grants);
}

export { officeDisplayName as workbookDisplayName } from "./office-paths.js";
