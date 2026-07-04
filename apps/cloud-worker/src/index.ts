import { loadCloudWorkerEnv } from "./load-env.js";
import { parseCli, printCliHelp } from "./cli.js";

loadCloudWorkerEnv();

const cli = parseCli(process.argv);

if (cli.command === "help") {
  printCliHelp();
  process.exit(0);
}

const { loadCloudWorkerConfig } = await import("./config.js");

if (cli.command === "run-once") {
  const config = loadCloudWorkerConfig();
  console.log("[cloud-worker] run-once", {
    apiUrl: config.apiUrl,
    runId: cli.args.runId,
    organizationId: cli.args.organizationId,
  });
  const { runOnceCommand } = await import("./run-once.js");
  const exitCode = await runOnceCommand(config, cli.args);
  process.exit(exitCode);
}

if (cli.command === "agent-run-once") {
  const config = loadCloudWorkerConfig();
  console.log("[cloud-worker] agent-run-once", {
    apiUrl: config.apiUrl,
    runId: cli.args.runId,
    organizationId: cli.args.organizationId,
  });
  const { agentRunOnceCommand } = await import("./agent-run-once.js");
  const exitCode = await agentRunOnceCommand(config, cli.args);
  process.exit(exitCode);
}

const { waitForApiReachable } = await import("./api-health.js");
const { CloudWorkflowRunner } = await import("./runner.js");

const config = loadCloudWorkerConfig();
console.log("[cloud-worker] using API", config.apiUrl);

await waitForApiReachable(config);

const runner = new CloudWorkflowRunner(config);
runner.start();

function shutdown(signal: string) {
  console.log(`[cloud-worker] received ${signal}, shutting down`);
  runner.stop();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
