import { runHeadlessPiPrompt as runHeadlessPiPromptCore } from "@openharness/workflow-executor";

export { extractAssistantText } from "@openharness/workflow-executor";
import { resolvePiSpawn } from "./pi-bin.js";
import { releaseGithubActionsAuthFile } from "./github-actions-session.js";
import { releaseWorkflowNotifyAuthFile } from "./workflow-notify-session.js";

function releaseWorkflowAuthFiles(env: NodeJS.ProcessEnv | undefined): void {
  releaseGithubActionsAuthFile(env);
  releaseWorkflowNotifyAuthFile(env);
}

export async function runHeadlessPiPrompt(options: {
  cwd: string;
  prompt: string;
  model?: { provider: string; modelId: string } | null;
  env?: NodeJS.ProcessEnv;
  onEvent?: (event: unknown) => void;
}) {
  return runHeadlessPiPromptCore({
    spawn: resolvePiSpawn(["--mode", "rpc"]),
    cwd: options.cwd,
    prompt: options.prompt,
    model: options.model,
    env: options.env,
    onEvent: options.onEvent,
    onAuthFileReleased: releaseWorkflowAuthFiles,
  });
}
