import { Result } from "better-result";
import { loadCloudWorkerEnv } from "./load-env.js";
import { parseCli, printCliHelp } from "./cli.js";
import { loadCloudWorkerConfig } from "./config.js";
import { waitForApiReachable } from "./api-health.js";
import { CloudWorkflowRunner } from "./runner.js";
import { logFatalAndExit } from "./result-helpers.js";
import type { CloudWorkerStartupError } from "./errors.js";

export type BootstrapResult =
  | { kind: "exit"; code: number }
  | { kind: "fatal"; error: CloudWorkerStartupError }
  | { kind: "poll"; runner: CloudWorkflowRunner };

export async function runCloudWorkerEntrypoint(argv: string[]): Promise<BootstrapResult> {
  loadCloudWorkerEnv();

  const cliResult = parseCli(argv);
  if (Result.isError(cliResult)) {
    return { kind: "fatal", error: cliResult.error };
  }
  const cli = cliResult.value;

  if (cli.command === "help") {
    printCliHelp();
    return { kind: "exit", code: 0 };
  }

  if (cli.command === "run-once") {
    const configResult = loadCloudWorkerConfig();
    if (Result.isError(configResult)) {
      return { kind: "fatal", error: configResult.error };
    }
    const config = configResult.value;
    console.log("[cloud-worker] run-once", {
      apiUrl: config.apiUrl,
      runId: cli.args.runId,
      organizationId: cli.args.organizationId,
    });
    const { runOnceCommand } = await import("./run-once.js");
    const exitCode = await runOnceCommand(config, cli.args);
    return { kind: "exit", code: exitCode };
  }

  if (cli.command === "agent-run-once") {
    const configResult = loadCloudWorkerConfig();
    if (Result.isError(configResult)) {
      return { kind: "fatal", error: configResult.error };
    }
    const config = configResult.value;
    console.log("[cloud-worker] agent-run-once", {
      apiUrl: config.apiUrl,
      runId: cli.args.runId,
      organizationId: cli.args.organizationId,
    });
    const { agentRunOnceCommand } = await import("./agent-run-once.js");
    const exitCode = await agentRunOnceCommand(config, cli.args);
    return { kind: "exit", code: exitCode };
  }

  const configResult = loadCloudWorkerConfig();
  if (Result.isError(configResult)) {
    return { kind: "fatal", error: configResult.error };
  }
  const config = configResult.value;
  console.log("[cloud-worker] using API", config.apiUrl);

  const apiHealthResult = await waitForApiReachable(config);
  if (Result.isError(apiHealthResult)) {
    return { kind: "fatal", error: apiHealthResult.error };
  }

  const runner = new CloudWorkflowRunner(config);
  runner.start();
  return { kind: "poll", runner };
}

export function handleBootstrapResult(result: BootstrapResult): void {
  if (result.kind === "fatal") {
    logFatalAndExit(result.error);
  }
  if (result.kind === "exit") {
    process.exit(result.code);
  }

  const { runner } = result;

  function shutdown(signal: string) {
    console.log(`[cloud-worker] received ${signal}, shutting down`);
    runner.stop();
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
