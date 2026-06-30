export {
  officeDisplayName as workbookDisplayName,
  officeFileKindFromPath,
  readOfficeFileAtPath as readWorkbookFileAtPath,
  resolveOfficeFilePath as resolveWorkbookPath,
  resolveOfficeRelativePath,
} from "./office-paths.js";

import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveOfficeRelativePath } from "./office-paths.js";

export function resolveWorkbookRelativePath(
  cwd: string,
  filePath: string,
  grants: AttachedRoot[] = [],
): { absolutePath: string; relativePath: string } | null {
  const resolved = resolveOfficeRelativePath(cwd, filePath, grants);
  if (!resolved || resolved.kind !== "xlsx") return null;
  return {
    absolutePath: resolved.absolutePath,
    relativePath: resolved.relativePath,
  };
}
