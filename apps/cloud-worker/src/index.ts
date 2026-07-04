import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleBootstrapResult, runCloudWorkerEntrypoint } from "./bootstrap.js";

export function isEntrypointProcess(argv: string[]): boolean {
  if (typeof argv[1] !== "string") return false;
  return fileURLToPath(import.meta.url) === resolve(argv[1]);
}

export async function startFromArgv(argv: string[]): Promise<void> {
  const result = await runCloudWorkerEntrypoint(argv);
  handleBootstrapResult(result);
}

export async function runIfEntrypoint(argv: string[]): Promise<void> {
  if (isEntrypointProcess(argv)) {
    await startFromArgv(argv);
  }
}

await runIfEntrypoint(process.argv);
