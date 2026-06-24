import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, normalize, relative, resolve } from "node:path";
import type { WebContents } from "electron";

const CHANGE_CHANNEL = "harness:project-file-changed";
const DEBOUNCE_MS = 150;

type WatchEntry = {
  watcher: FSWatcher;
  cwd: string;
  relativePath: string;
  timer: NodeJS.Timeout | null;
};

/**
 * One watcher per renderer (keyed by webContents id). The file preview only
 * ever shows a single file at a time, so we watch the parent directory of the
 * selected file (non-recursive) and filter events down to that one filename.
 * Watching the directory rather than the file itself keeps the watch alive
 * across atomic-rename saves (write-temp + rename), which is how many editors
 * and agents write files.
 */
const watchers = new Map<number, WatchEntry>();

function resolveSafe(
  cwd: string,
  relativePath: string,
): { absolutePath: string; relativePath: string } | null {
  const normalizedCwd = resolve(cwd);
  const absolutePath = resolve(normalizedCwd, relativePath);
  const rel = relative(normalizedCwd, absolutePath);
  if (rel.startsWith("..") || rel === "..") return null;
  return { absolutePath, relativePath: normalize(relativePath).replace(/\\/g, "/") };
}

export function watchProjectFile(
  sender: WebContents,
  cwd: string,
  relativePath: string,
): void {
  unwatchProjectFile(sender);

  const resolved = resolveSafe(cwd, relativePath);
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
        sender.send(CHANGE_CHANNEL, { cwd, relativePath: resolved.relativePath });
      }, DEBOUNCE_MS);
    });
  } catch (err) {
    console.error("[watchProjectFile]", err);
    return;
  }

  watcher.on("error", (err) => {
    console.error("[watchProjectFile] watcher error", err);
    unwatchProjectFile(sender);
  });

  watchers.set(sender.id, {
    watcher,
    cwd,
    relativePath: resolved.relativePath,
    timer: null,
  });
  sender.once("destroyed", () => unwatchProjectFile(sender));
}

export function unwatchProjectFile(sender: WebContents): void {
  const entry = watchers.get(sender.id);
  if (entry == null) return;
  watchers.delete(sender.id);
  if (entry.timer != null) clearTimeout(entry.timer);
  try {
    entry.watcher.close();
  } catch {
    // ignore – watcher may already be closed
  }
}
