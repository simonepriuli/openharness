import { copyFileSync, existsSync } from "node:fs";

export function backupFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }
  copyFileSync(filePath, `${filePath}.bak`);
}
