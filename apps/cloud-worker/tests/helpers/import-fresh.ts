import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const testsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function importFresh<T>(modulePath: string): Promise<T> {
  const filePath = join(testsRoot, modulePath);
  const href = `${pathToFileURL(filePath).href}?fresh=${Date.now()}-${Math.random()}`;
  return import(href) as Promise<T>;
}
