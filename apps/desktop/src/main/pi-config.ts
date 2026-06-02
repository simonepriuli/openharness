import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { appStore } from "./store.js";

/** Pi agent dir when using the global CLI profile (`~/.pi/agent`). */
export const GLOBAL_PI_AGENT_DIR = path.join(homedir(), ".pi", "agent");

export function useGlobalPiConfig(): boolean {
  return appStore.get("useGlobalPiConfig") === true;
}

export function setUseGlobalPiConfig(value: boolean): void {
  appStore.set("useGlobalPiConfig", value);
}

export function getPiAgentDir(): string {
  if (useGlobalPiConfig()) {
    return GLOBAL_PI_AGENT_DIR;
  }
  return path.join(app.getPath("userData"), "pi", "agent");
}

export function getPiSessionsRoot(): string {
  return path.join(getPiAgentDir(), "sessions");
}

export function getGlobalPiSessionsRoot(): string {
  return path.join(GLOBAL_PI_AGENT_DIR, "sessions");
}

export function ensurePiAgentDir(): void {
  const agentDir = getPiAgentDir();
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(path.join(agentDir, "sessions"), { recursive: true });
  ensureDesktopQuestionExtension(agentDir);
}

const OPENHARNESS_ASK_QUESTION_EXTENSION_VERSION = 2;
const OPENHARNESS_ASK_QUESTION_VERSION_MARKER = `openharness-ask-question-version:${OPENHARNESS_ASK_QUESTION_EXTENSION_VERSION}`;

function ensureDesktopQuestionExtension(agentDir: string): void {
  const extensionsDir = path.join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const extensionPath = path.join(extensionsDir, "openharness-ask-question.ts");
  if (existsSync(extensionPath)) {
    const existing = readFileSync(extensionPath, "utf8");
    if (existing.includes(OPENHARNESS_ASK_QUESTION_VERSION_MARKER)) return;
  }
  writeFileSync(
    extensionPath,
    `// ${OPENHARNESS_ASK_QUESTION_VERSION_MARKER}\n${OPENHARNESS_ASK_QUESTION_EXTENSION}`,
    "utf8",
  );
}

const OPENHARNESS_ASK_QUESTION_EXTENSION = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const OptionSchema = Type.Object({
  id: Type.String({ description: "Unique option id" }),
  label: Type.String({ description: "Option text shown to the user" }),
});

const QuestionSchema = Type.Object({
  id: Type.String({ description: "Unique question id" }),
  prompt: Type.String({ description: "Question text shown to the user" }),
  options: Type.Array(OptionSchema, { minItems: 2 }),
  allow_multiple: Type.Optional(Type.Boolean({ description: "Allow selecting multiple options" })),
});

const AskQuestionParams = Type.Object({
  title: Type.Optional(Type.String({ description: "Optional panel title" })),
  questions: Type.Array(QuestionSchema, { minItems: 1 }),
});

type Option = { id: string; label: string };
type Question = { id: string; prompt: string; options: Option[]; allow_multiple?: boolean };

export default function openharnessAskQuestion(pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask_question",
    label: "Ask Question",
    description:
      "Present structured multiple-choice questions in the OpenHarness question panel and wait for answers. Use for any non-confirmation question that needs a user choice.",
    promptSnippet:
      "ask_question(title, questions[]) — required UI for user choices (preferences, scope, options).",
    promptGuidelines: [
      "Whenever you need the user to pick between options, clarify preferences, scope, approach, or missing requirements, call ask_question instead of asking in your assistant message.",
      "Do not ask multiple-choice or preference questions in plain text (no numbered lists, no A/B/C options, no 'which do you prefer?' in chat).",
      "Simple yes/no confirmation questions (e.g. 'Should I continue?') may stay in assistant text; everything else that needs a choice must use ask_question.",
      "Provide concise question prompts and at least two clear options per question; batch related questions in one ask_question call when helpful.",
      "Wait for the ask_question tool result before continuing based on the user's answers.",
      "For single-choice questions, leave allow_multiple unset or false.",
    ],
    parameters: AskQuestionParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const answers: Array<{ id: string; value: string; label: string }> = [];
      const questions = (params.questions as Question[]) ?? [];
      for (const question of questions) {
        if (question.allow_multiple) {
          const selected = await askMulti(ctx, question);
          if (selected === undefined) {
            return {
              content: [{ type: "text", text: "User cancelled question flow." }],
              details: { cancelled: true, answers },
            };
          }
          answers.push(...selected);
          continue;
        }

        const choice = await ctx.ui.select(question.prompt, question.options.map((option) => option.label));
        if (!choice) {
          return {
            content: [{ type: "text", text: "User cancelled question flow." }],
            details: { cancelled: true, answers },
          };
        }
        const matched = question.options.find((option) => option.label === choice);
        answers.push({
          id: question.id,
          value: matched?.id ?? choice,
          label: choice,
        });
      }

      const text =
        answers.length === 0
          ? "User skipped all questions."
          : answers.map((answer) => "- " + answer.id + ": " + answer.label).join("\\n");
      return {
        content: [{ type: "text", text }],
        details: { cancelled: false, answers },
      };
    },
  });
}

async function askMulti(
  ctx: any,
  question: Question,
): Promise<Array<{ id: string; value: string; label: string }> | undefined> {
  const selected = new Set<string>();
  while (true) {
    const labels = question.options.map((option) =>
      (selected.has(option.id) ? "[x] " : "[ ] ") + option.label,
    );
    labels.push("Done");
    const choice = await ctx.ui.select(question.prompt, labels);
    if (!choice) return undefined;
    if (choice === "Done") {
      return question.options
        .filter((option) => selected.has(option.id))
        .map((option) => ({ id: question.id, value: option.id, label: option.label }));
    }
    const index = labels.indexOf(choice);
    if (index < 0 || index >= question.options.length) continue;
    const option = question.options[index];
    if (!option) continue;
    if (selected.has(option.id)) selected.delete(option.id);
    else selected.add(option.id);
  }
}
`;
