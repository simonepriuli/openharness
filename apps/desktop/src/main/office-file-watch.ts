import { watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import type { WebContents } from "electron";
import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveOfficeFilePath } from "./office-paths.js";

const CHANGE_CHANNEL = "harness:office-file-changed";
const LEGACY_CHANGE_CHANNEL = "harness:workbook-changed";
const DEBOUNCE_MS = 300;

type WatchEntry = {
  watcher: FSWatcher;
  cwd: string;
  relativePath: string;
  timer: NodeJS.Timeout | null;
};

const watchers = new Map<number, WatchEntry>();

export function watchOfficeFile(
  sender: WebContents,
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): void {
  unwatchOfficeFile(sender);

  const resolved = resolveOfficeFilePath(cwd, relativePath, grants);
  if (!resolved) return;

  const directory = dirname(resolved.absolutePath);
  const targetName = basename(resolved.absolutePath);

  let watcher: FSWatcher;
  try {
    watcher = watch(directory, { persistent: false }, (_eventType, filename) => {
      if (filename != null && basename(filename.toString()) !== targetName) return;
      const entry = watchers.get(sender.id);
      if (entry == null) return;
      if (entry.timer != null) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        if (sender.isDestroyed()) return;
        const payload = { cwd, relativePath: resolved.pathKey };
        sender.send(CHANGE_CHANNEL, payload);
        sender.send(LEGACY_CHANGE_CHANNEL, payload);
      }, DEBOUNCE_MS);
    });
  } catch (err) {
    console.error("[watchOfficeFile]", err);
    return;
  }

  watcher.on("error", (err) => {
    console.error("[watchOfficeFile] watcher error", err);
    unwatchOfficeFile(sender);
  });

  watchers.set(sender.id, {
    watcher,
    cwd,
    relativePath: resolved.pathKey,
    timer: null,
  });
  sender.once("destroyed", () => unwatchOfficeFile(sender));
}

export function unwatchOfficeFile(sender: WebContents): void {
  const entry = watchers.get(sender.id);
  if (entry == null) return;
  watchers.delete(sender.id);
  if (entry.timer != null) clearTimeout(entry.timer);
  try {
    entry.watcher.close();
  } catch {
    // ignore
  }
}

export function watchWorkbookFile(
  sender: WebContents,
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): void {
  watchOfficeFile(sender, cwd, relativePath, grants);
}

export function unwatchWorkbookFile(sender: WebContents): void {
  unwatchOfficeFile(sender);
}
