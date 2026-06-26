import { watch, type FSWatcher } from "node:fs";
import { basename, dirname } from "node:path";
import type { WebContents } from "electron";
import type { AttachedRoot } from "../shared/path-grants.js";
import { resolveWorkbookPath } from "./workbook-paths.js";

const CHANGE_CHANNEL = "harness:workbook-changed";
const DEBOUNCE_MS = 300;

type WatchEntry = {
  watcher: FSWatcher;
  cwd: string;
  relativePath: string;
  timer: NodeJS.Timeout | null;
};

const watchers = new Map<number, WatchEntry>();

export function watchWorkbookFile(
  sender: WebContents,
  cwd: string,
  relativePath: string,
  grants: AttachedRoot[] = [],
): void {
  unwatchWorkbookFile(sender);

  const resolved = resolveWorkbookPath(cwd, relativePath, grants);
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
        sender.send(CHANGE_CHANNEL, { cwd, relativePath: resolved.pathKey });
      }, DEBOUNCE_MS);
    });
  } catch (err) {
    console.error("[watchWorkbookFile]", err);
    return;
  }

  watcher.on("error", (err) => {
    console.error("[watchWorkbookFile] watcher error", err);
    unwatchWorkbookFile(sender);
  });

  watchers.set(sender.id, {
    watcher,
    cwd,
    relativePath: resolved.pathKey,
    timer: null,
  });
  sender.once("destroyed", () => unwatchWorkbookFile(sender));
}

export function unwatchWorkbookFile(sender: WebContents): void {
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
