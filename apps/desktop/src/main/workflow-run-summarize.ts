import { summarizeWorkflowRun as summarizeWorkflowRunCore } from "@openharness/workflow-executor";
import { runHeadlessPiPrompt } from "./workflow-pi.js";

export { fallbackResultMarkdown } from "@openharness/workflow-executor";

export async function summarizeWorkflowRun(options: {
  assistantText: string;
  workflowName: string;
  event: string;
  projectPath: string;
  modelRef: string;
}): Promise<string> {
  return summarizeWorkflowRunCore({
    ...options,
    pi: {
      run: (runOptions) => runHeadlessPiPrompt(runOptions),
    },
  });
}
