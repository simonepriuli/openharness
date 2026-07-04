import { Result } from "better-result";
import { CliParseError } from "./errors.js";

export type CloudWorkerCommand = "poll" | "run-once" | "agent-run-once" | "help";

export type RunOnceArgs = {
  runId: string;
  organizationId: string;
};

export type ParsedCli =
  | { command: "poll" }
  | { command: "run-once"; args: RunOnceArgs }
  | { command: "agent-run-once"; args: RunOnceArgs }
  | { command: "help" };

export function parseCli(argv: string[]): Result<ParsedCli, CliParseError> {
  const args = argv.slice(2);
  const command = args[0]?.trim() || "poll";

  if (command === "help" || command === "--help" || command === "-h") {
    return Result.ok({ command: "help" });
  }

  if (command === "poll") {
    return Result.ok({ command: "poll" });
  }

  if (command === "run-once") {
    const runId = readFlag(args, "--run-id") ?? process.env.RUN_ID?.trim();
    const organizationId =
      readFlag(args, "--organization-id") ?? process.env.ORGANIZATION_ID?.trim();
    if (!runId || !organizationId) {
      return Result.err(
        new CliParseError({
          message:
            "run-once requires --run-id and --organization-id (or RUN_ID / ORGANIZATION_ID)",
        }),
      );
    }
    return Result.ok({ command: "run-once", args: { runId, organizationId } });
  }

  if (command === "agent-run-once") {
    const runId = readFlag(args, "--run-id") ?? process.env.RUN_ID?.trim();
    const organizationId =
      readFlag(args, "--organization-id") ?? process.env.ORGANIZATION_ID?.trim();
    if (!runId || !organizationId) {
      return Result.err(
        new CliParseError({
          message:
            "agent-run-once requires --run-id and --organization-id (or RUN_ID / ORGANIZATION_ID)",
        }),
      );
    }
    return Result.ok({ command: "agent-run-once", args: { runId, organizationId } });
  }

  return Result.err(
    new CliParseError({
      message: `Unknown command: ${command}. Use poll, run-once, agent-run-once, or help.`,
    }),
  );
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1]?.trim() || undefined;
}

export function printCliHelp(): void {
  console.log(`OpenHarness cloud worker

Usage:
  cloud-worker [poll]                 Poll pending cloud runs (local dev)
  cloud-worker run-once [options]   Execute a single dispatched workflow run (Vercel Sandbox)
  cloud-worker agent-run-once ...   Execute a single dispatched Linear agent run

Options for run-once / agent-run-once:
  --run-id <uuid>
  --organization-id <uuid>

Environment:
  OPENHARNESS_API_URL, CLOUD_WORKER_SECRET, OPENHARNESS_ROOT
  RUN_ID, ORGANIZATION_ID, VERCEL_SANDBOX_NAME (run-once in sandbox)
`);
}
