import { app } from "electron";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findFirstCuratedModelRef } from "../shared/curated-model-slots.js";
import { parseModelRef } from "../shared/model-ref.js";
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
  ensureOpenHarnessKnowledgeWorkflowExtension(agentDir);
  ensureExaWebSearchExtension(agentDir);
  ensureOpenHarnessPlanModeExtension(agentDir);
  ensureOpenHarnessWorkModeExtension(agentDir);
  ensureOfficeToolsExtension(agentDir);
}

/**
 * Sync the Pi settings.json defaultModel/defaultProvider to the first model
 * shown in the chat model switcher. This ensures new sessions start with a
 * model the user actually selected, rather than a stale default.
 *
 * Resolution order:
 *  1. First entry in chatVisibleModels (user-pinned models)
 *  2. First curated-slot match from lastKnownModelRefs (curated defaults)
 *  3. Leave existing default unchanged
 */
export function syncDefaultModelToPiSettings(): void {
  const agentDir = getPiAgentDir();
  const settingsPath = path.join(agentDir, "settings.json");

  // Resolve the desired default model ref
  const chatVisibleModels: string[] = appStore.get("chatVisibleModels") ?? [];
  const lastKnownModelRefs: string[] = appStore.get("lastKnownModelRefs") ?? [];

  let desiredRef: string | null = null;

  if (chatVisibleModels.length > 0) {
    desiredRef = chatVisibleModels[0].trim();
  } else if (lastKnownModelRefs.length > 0) {
    desiredRef = findFirstCuratedModelRef(lastKnownModelRefs);
  }

  if (!desiredRef) return; // nothing to sync

  const parsed = parseModelRef(desiredRef);
  if (!parsed) return;

  // Read existing settings.json (may not exist yet)
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, "utf8");
      settings = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      settings = {};
    }
  }

  // Only write if the default would actually change
  const currentModel = typeof settings.defaultModel === "string" ? settings.defaultModel : "";
  const currentProvider = typeof settings.defaultProvider === "string" ? settings.defaultProvider : "";

  if (currentModel === parsed.modelId && currentProvider === parsed.provider) return;

  settings.defaultProvider = parsed.provider;
  settings.defaultModel = parsed.modelId;

  const tmp = `${settingsPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, settingsPath);
}

const OPENHARNESS_ASK_QUESTION_EXTENSION_VERSION = 2;
const OPENHARNESS_ASK_QUESTION_VERSION_MARKER = `openharness-ask-question-version:${OPENHARNESS_ASK_QUESTION_EXTENSION_VERSION}`;
const OPENHARNESS_KNOWLEDGE_WORKFLOW_EXTENSION_VERSION = 3;
const OPENHARNESS_KNOWLEDGE_WORKFLOW_VERSION_MARKER = `openharness-knowledge-workflow-version:${OPENHARNESS_KNOWLEDGE_WORKFLOW_EXTENSION_VERSION}`;
const OPENHARNESS_EXA_WEB_SEARCH_EXTENSION_VERSION = 1;
const OPENHARNESS_EXA_WEB_SEARCH_VERSION_MARKER = `openharness-exa-web-search-version:${OPENHARNESS_EXA_WEB_SEARCH_EXTENSION_VERSION}`;
const OPENHARNESS_PLAN_MODE_EXTENSION_VERSION = 1;
const OPENHARNESS_PLAN_MODE_VERSION_MARKER = `openharness-plan-mode-version:${OPENHARNESS_PLAN_MODE_EXTENSION_VERSION}`;
const OPENHARNESS_WORK_MODE_EXTENSION_VERSION = 3;
const OPENHARNESS_WORK_MODE_VERSION_MARKER = `openharness-work-mode-version:${OPENHARNESS_WORK_MODE_EXTENSION_VERSION}`;
const OPENHARNESS_OFFICE_TOOLS_VERSION = 2;
const OPENHARNESS_OFFICE_TOOLS_VERSION_MARKER = `openharness-office-tools-version:${OPENHARNESS_OFFICE_TOOLS_VERSION}`;

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

function ensureOpenHarnessKnowledgeWorkflowExtension(agentDir: string): void {
  const extensionsDir = path.join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const extensionPath = path.join(extensionsDir, "openharness-knowledge-workflow.ts");
  if (existsSync(extensionPath)) {
    const existing = readFileSync(extensionPath, "utf8");
    if (existing.includes(OPENHARNESS_KNOWLEDGE_WORKFLOW_VERSION_MARKER)) return;
  }
  writeFileSync(
    extensionPath,
    `// ${OPENHARNESS_KNOWLEDGE_WORKFLOW_VERSION_MARKER}\n${OPENHARNESS_KNOWLEDGE_WORKFLOW_EXTENSION}`,
    "utf8",
  );
}

function ensureExaWebSearchExtension(agentDir: string): void {
  const extensionsDir = path.join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const extensionPath = path.join(extensionsDir, "openharness-exa-web-search.ts");
  if (existsSync(extensionPath)) {
    const existing = readFileSync(extensionPath, "utf8");
    if (existing.includes(OPENHARNESS_EXA_WEB_SEARCH_VERSION_MARKER)) return;
  }
  writeFileSync(
    extensionPath,
    `// ${OPENHARNESS_EXA_WEB_SEARCH_VERSION_MARKER}\n${OPENHARNESS_EXA_WEB_SEARCH_EXTENSION}`,
    "utf8",
  );
}

function ensureOpenHarnessPlanModeExtension(agentDir: string): void {
  const extensionsDir = path.join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const extensionPath = path.join(extensionsDir, "openharness-plan-mode.ts");
  if (existsSync(extensionPath)) {
    const existing = readFileSync(extensionPath, "utf8");
    if (existing.includes(OPENHARNESS_PLAN_MODE_VERSION_MARKER)) return;
  }
  writeFileSync(
    extensionPath,
    `// ${OPENHARNESS_PLAN_MODE_VERSION_MARKER}\n${OPENHARNESS_PLAN_MODE_EXTENSION}`,
    "utf8",
  );
}

function ensureOpenHarnessWorkModeExtension(agentDir: string): void {
  const extensionsDir = path.join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const extensionPath = path.join(extensionsDir, "openharness-work-mode.ts");
  if (existsSync(extensionPath)) {
    const existing = readFileSync(extensionPath, "utf8");
    if (existing.includes(OPENHARNESS_WORK_MODE_VERSION_MARKER)) return;
  }
  writeFileSync(
    extensionPath,
    `// ${OPENHARNESS_WORK_MODE_VERSION_MARKER}\n${OPENHARNESS_WORK_MODE_EXTENSION}`,
    "utf8",
  );
}

function getOfficeToolsTemplateDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "pi", "extensions", "openharness-office-tools");
  }
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "../../pi-extensions/office-tools");
}

function copyOfficeToolsDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    if (entry === "node_modules") continue;
    cpSync(path.join(src, entry), path.join(dest, entry), { recursive: true });
  }
}

function ensureOfficeToolsExtension(agentDir: string): void {
  const templateDir = getOfficeToolsTemplateDir();
  const templateIndex = path.join(templateDir, "index.ts");
  if (!existsSync(templateIndex)) {
    console.error("[pi-config] Office tools template missing:", templateDir);
    return;
  }

  const destDir = path.join(agentDir, "extensions", "openharness-office-tools");
  const destIndex = path.join(destDir, "index.ts");
  let needsRefresh = true;
  if (existsSync(destIndex)) {
    const existing = readFileSync(destIndex, "utf8");
    if (existing.includes(OPENHARNESS_OFFICE_TOOLS_VERSION_MARKER)) {
      needsRefresh = false;
    }
  }

  if (needsRefresh) {
    copyOfficeToolsDir(templateDir, destDir);
    const templateModules = path.join(templateDir, "node_modules");
    if (existsSync(templateModules)) {
      cpSync(templateModules, path.join(destDir, "node_modules"), { recursive: true });
    }
  }

  const excelJsModule = path.join(destDir, "node_modules", "exceljs");
  if (!existsSync(excelJsModule)) {
    const install = spawnSync("npm", ["install", "--omit=dev", "--ignore-scripts"], {
      cwd: destDir,
      stdio: "inherit",
    });
    if (install.status !== 0) {
      console.error("[pi-config] Failed to install office-tools dependencies in", destDir);
    }
  }
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

const OPENHARNESS_EXA_WEB_SEARCH_EXTENSION = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const FETCH_TIMEOUT_MS = 15_000;

const WebSearchParams = Type.Object({
  query: Type.String({ description: "Natural language search query" }),
  num_results: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 10, description: "Number of results (default 5)" }),
  ),
});

type ExaHighlight = string | string[];

type ExaResult = {
  title?: string;
  url?: string;
  highlights?: ExaHighlight;
};

type ExaSearchResponse = {
  results?: ExaResult[];
};

function formatHighlights(highlights: ExaHighlight | undefined): string {
  if (!highlights) return "";
  if (typeof highlights === "string") return highlights.trim();
  return highlights
    .map((h) => h.trim())
    .filter(Boolean)
    .join("\\n");
}

export default function openharnessExaWebSearch(pi: ExtensionAPI) {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) return;

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for current information, documentation, news, and facts not available in the local codebase. Powered by Exa.",
    promptSnippet: "web_search(query, num_results?) — search the web via Exa for external/current information.",
    promptGuidelines: [
      "Use web_search for current events, external documentation, libraries, APIs, and facts that are not in the project repository.",
      "Prefer grep/find/read for searching within the current codebase.",
      "Include specific, descriptive queries rather than vague keywords.",
      "Cite source URLs from results when sharing factual claims with the user.",
    ],
    parameters: WebSearchParams,
    async execute(_toolCallId, params, signal) {
      const query = String(params.query ?? "").trim();
      if (!query) {
        return {
          content: [{ type: "text", text: "Error: query is required." }],
          details: { error: "missing_query" },
        };
      }

      const numResults = typeof params.num_results === "number" ? params.num_results : 5;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      try {
        const response = await fetch(EXA_SEARCH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query,
            type: "auto",
            numResults,
            contents: {
              highlights: { maxCharacters: 2000 },
            },
          }),
          signal: controller.signal,
        });

        if (response.status === 401 || response.status === 403) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Invalid Exa API key. Check Settings → Web search and update your key.",
              },
            ],
            details: { error: "invalid_api_key", status: response.status },
          };
        }

        if (!response.ok) {
          const bodyText = await response.text().catch(() => "");
          const suffix = bodyText ? ": " + bodyText.slice(0, 200) : "";
          return {
            content: [
              {
                type: "text",
                text: "Error: Exa search failed (HTTP " + response.status + ")" + suffix + ".",
              },
            ],
            details: { error: "http_error", status: response.status },
          };
        }

        const data = (await response.json()) as ExaSearchResponse;
        const results = data.results ?? [];

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: "No web results found for: " + query }],
            details: { resultCount: 0 },
          };
        }

        const lines = results.map((result, index) => {
          const title = (result.title ?? "Untitled").trim();
          const url = (result.url ?? "").trim();
          const highlights = formatHighlights(result.highlights);
          const parts = [String(index + 1) + ". " + title];
          if (url) parts.push("URL: " + url);
          if (highlights) parts.push(highlights);
          return parts.join("\\n");
        });

        return {
          content: [
            {
              type: "text",
              text: 'Web search results for "' + query + '":\\n\\n' + lines.join("\\n\\n"),
            },
          ],
          details: { resultCount: results.length },
        };
      } catch (err) {
        const message =
          err instanceof Error && err.name === "AbortError"
            ? "Exa search request timed out."
            : err instanceof Error
              ? err.message
              : "Exa search request failed.";
        return {
          content: [{ type: "text", text: "Error: " + message }],
          details: { error: "request_failed" },
        };
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
      }
    },
  });
}
`;

const OPENHARNESS_KNOWLEDGE_WORKFLOW_EXTENSION = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WORKFLOW_PROMPT_APPEND = String.raw\`

OpenHarness knowledge workflow (project memory):
- Treat .openharness/ in the current project as canonical project memory shared across agent threads.
- OpenHarness creates the empty .openharness/ directory when a project is added; the project docs themselves belong to the user's project.
- Do not create or update .openharness docs in the OpenHarness app repository unless that repository is the selected user project.

Startup read order:
- If .openharness/index.md exists, read it first, then read only the docs it routes you to for the current task.
- If .openharness/index.md is missing but other .openharness/*.md files exist, read all existing markdown files before planning or implementation.
- If .openharness/ is missing or has no markdown files, bootstrap project memory before normal task work.

Empty-folder bootstrap:
- First perform a bounded discovery pass. Read README/docs, package manifests, workspace config, scripts, app/server entrypoints, routing, API boundaries, schema/migrations, test setup, deployment/config files, and existing agent guidance where present.
- Use search to identify major feature areas and integration points. Do not summarize every file.
- Create these files using the schemas below: index.md, project.md, architecture.md, features.md, runbook.md, decisions.md, current-work.md.
- Populate index.md last so its routing map matches the docs you created.
- After bootstrap, continue with the user's original task.

Required schemas:

index.md:
- Purpose: one sentence explaining this is the first-read routing map.
- Read first: list the minimal docs to read for common task types (architecture, feature work, bugs, tests, setup, releases, active work).
- Task routing: map features/domains to the most relevant docs and source paths.
- Update rules: update this file when docs are added, removed, renamed, or routing changes.

project.md:
- Purpose: product/app purpose in one short paragraph.
- Tech stack: languages, frameworks, package managers, runtimes, storage, major services.
- Repo map: important directories and what they own.
- Conventions: naming, code style, framework patterns, agent rules, generated files.
- Glossary: project-specific terms future agents need.
- Update rules: update when purpose, stack, repo layout, conventions, or terminology changes.

architecture.md:
- Runtime architecture: main processes/apps/services and how they interact.
- Data and control flow: concise end-to-end flows for critical behavior.
- Boundaries and contracts: API, IPC, database, queue, filesystem, network, or package boundaries.
- External systems: providers, services, credentials, webhooks, integrations.
- Critical invariants: rules that must remain true for correctness.
- Update rules: update on architecture, boundary, contract, integration, or invariant changes.

features.md:
- Feature map: user-visible or domain features with entry points and key files.
- Ownership boundaries: what code owns each feature and what should not be touched for that feature.
- Common change paths: where to edit for UI, API, persistence, tests, config, and copy.
- Known edge cases: important behavior or failure modes.
- Update rules: update when features, ownership, or common change paths change.

runbook.md:
- Setup: install, bootstrap, required tools, environment variables.
- Run commands: local dev, background services, mocks, seeds.
- Test commands: fast checks, focused tests, full test suites, known slow/flaky tests.
- Build/release: packaging, deployment, release, rollback where applicable.
- Troubleshooting: recurring failures and fixes.
- Update rules: update when commands, prerequisites, test strategy, release flow, or failure recovery changes.

decisions.md:
- Decision log: durable ADR-lite entries only.
- Entry format: date, decision, context, impact, files/areas affected.
- Superseded decisions: mark old decisions as superseded instead of deleting useful history.
- Update rules: add entries for consequential architecture, contract, persistence, dependency, or workflow decisions.

current-work.md:
- Active initiatives: short-lived work streams and their current status.
- Recent context: important in-progress details not yet stable enough for other docs.
- Known risks/gaps: unresolved issues future agents should consider.
- Next updates: what should be promoted into stable docs later.
- Update rules: keep this file current and remove stale transient notes.

Maintenance protocol:
- Update .openharness only when durable project knowledge changes: architecture/component boundaries, interfaces/contracts, workflows/runbooks, feature ownership, test/release strategy, or non-obvious implementation behavior future agents need.
- Do not update for trivial refactors, formatting-only edits, mechanical renames with no knowledge change, or cosmetic-only changes.
- Replace stale facts instead of appending conflicting notes.
- Edit only the relevant file(s); do not rewrite all docs for every task.
- Update index.md when adding, removing, renaming, or rerouting .openharness docs.

End-of-task checklist:
- Confirm .openharness context was read or bootstrapped before implementation.
- If material knowledge changed, update the relevant .openharness docs before finalizing.
- In the final response, briefly mention whether .openharness was bootstrapped, updated, or left unchanged.
\`;

export default function openharnessKnowledgeWorkflow(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    const ctx = process.env.OPENHARNESS_CONVERSATION_CONTEXT;
    if (ctx === "work" || ctx === "work-project") return;
    return {
      systemPrompt: event.systemPrompt + WORKFLOW_PROMPT_APPEND,
    };
  });
}
`;

const OPENHARNESS_WORK_MODE_EXTENSION = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const WORK_CONTEXTS = new Set(["work", "work-project"]);
const DISABLED_WORK_MODE_TOOLS = new Set(["ask_question"]);

function isWorkMode(): boolean {
  const ctx = process.env.OPENHARNESS_CONVERSATION_CONTEXT;
  return typeof ctx === "string" && WORK_CONTEXTS.has(ctx);
}

function workModeActiveTools(pi: ExtensionAPI): string[] {
  return pi
    .getAllTools()
    .map((tool) => tool.name)
    .filter((name) => !DISABLED_WORK_MODE_TOOLS.has(name));
}

const WORK_MODE_PROMPT_APPEND = String.raw\`
OpenHarness everyday work mode:
- Optimize for writing, research, planning, and day-to-day tasks — not software project bootstrap.
- Use clear, plain language. Keep answers concise unless the user asks for depth.
- Full tools are available — use read/search/bash/web/edit proactively when they help the task.
- For .docx and .xlsx files, use read_docx/read_xlsx and edit_docx/edit_xlsx — never raw read/edit/write on Office files.
- When the user has the work panel open, edits to .xlsx files appear in the in-app workbook preview automatically.
- Read Office files in chunks (paragraph windows for Word, row/column ranges for Excel) when documents may be large.
- For document folders on disk, prefer work-project threads so cwd points at the user's workspace.
- Do not create, read, update, or reference .openharness/ project memory in this mode.
- For work-project threads, treat the current working directory as the user's workspace and read/write files there when relevant.
- For general work chats, the working directory is a private scratch area; use it only when the task needs persistent files.
- ask_question is disabled in work mode. Ask clarifying questions in your assistant message instead of the question panel.
- State reasonable assumptions briefly instead of long interviews.
- Avoid unnecessary code dumps, stack traces, and implementation jargon unless the user wants technical detail.
\`;

export default function openharnessWorkMode(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    if (!isWorkMode()) return;
    pi.setActiveTools(workModeActiveTools(pi));
    return {
      systemPrompt: event.systemPrompt + WORK_MODE_PROMPT_APPEND,
    };
  });

  pi.on("tool_call", async (event) => {
    if (!isWorkMode()) return;
    if (DISABLED_WORK_MODE_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason:
          "Work mode: " +
          event.toolName +
          " is disabled. Ask the user in your assistant message instead.",
      };
    }
  });
}
`;

const OPENHARNESS_PLAN_MODE_EXTENSION = `import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "ask_question", "write_plan"];
const BLOCKED_TOOLS = new Set(["edit", "write", "swarm_dispatch"]);

const DESTRUCTIVE_PATTERNS = [
  /\\brm\\b/i,
  /\\bmv\\b/i,
  /\\bcp\\b/i,
  /\\bmkdir\\b/i,
  /\\btouch\\b/i,
  /\\bchmod\\b/i,
  /\\bchown\\b/i,
  /(>|>>)/,
  /\\bnpm\\s+(install|uninstall|update|ci)/i,
  /\\bgit\\s+(add|commit|push|pull|merge|rebase|reset|checkout)/i,
  /\\bsudo\\b/i,
];

const SAFE_PATTERNS = [
  /^\\s*cat\\b/,
  /^\\s*head\\b/,
  /^\\s*tail\\b/,
  /^\\s*grep\\b/,
  /^\\s*find\\b/,
  /^\\s*ls\\b/,
  /^\\s*pwd\\b/,
  /^\\s*wc\\b/,
  /^\\s*git\\s+(status|log|diff|show|branch)/i,
];

const WritePlanParams = Type.Object({
  markdown: Type.String({ description: "Full plan document in markdown" }),
});

const PLAN_INTERVIEW_APPEND = String.raw\`
OpenHarness Plan mode interview:
- Interview relentlessly until no meaningful design uncertainty remains.
- Use ask_question for most questions (consequential, one at a time when possible).
- Occasional freeform assistant follow-ups are OK for open-ended clarification.
- Do NOT implement, edit project files, use write/edit tools, or call swarm_dispatch.
- When ready, call write_plan with the complete markdown plan.
- After a plan exists, if the user sends feedback, revise the plan via write_plan only (still no code changes).
- Cover scope, constraints, sequencing, ownership, failure modes, and tradeoffs before writing the plan.
\`;

function planRelativePath(conversationId: string): string {
  return ".openharness/plans/" + conversationId + ".md";
}

function isSafeCommand(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

export default function openharnessPlanMode(pi: ExtensionAPI) {
  pi.registerTool({
    name: "write_plan",
    label: "Write Plan",
    description:
      "Write or replace the thread plan markdown file. Use only when the interview is complete or when revising the plan from user feedback.",
    promptSnippet: "write_plan(markdown) — persist the plan document for the Plan tab.",
    promptGuidelines: [
      "Call write_plan only after the interview is complete, or when revising an existing plan from user feedback.",
      "The markdown should be a complete, actionable implementation plan.",
    ],
    parameters: WritePlanParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const conversationId = ctx.getPlanConversationId();
      if (!conversationId) {
        return {
          content: [{ type: "text", text: "Plan mode conversation id is not set." }],
          isError: true,
        };
      }
      const relativePath = planRelativePath(conversationId);
      const absolutePath = join(ctx.cwd, relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, params.markdown, "utf8");
      pi.appendEntry("plan-written", { conversationId, relativePath });
      return {
        content: [{ type: "text", text: "Plan written to " + relativePath }],
        details: { relativePath, conversationId },
      };
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!ctx.getPlanMode()) return;
    pi.setActiveTools(PLAN_MODE_TOOLS);
    return {
      systemPrompt: event.systemPrompt + PLAN_INTERVIEW_APPEND,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!ctx.getPlanMode()) return;
    if (BLOCKED_TOOLS.has(event.toolName)) {
      return {
        block: true,
        reason:
          "Plan mode: " +
          event.toolName +
          " is blocked. Finish the plan interview and use write_plan, or ask the user to click Implement plan before making changes.",
      };
    }
    if (event.toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      if (!isSafeCommand(command)) {
        return {
          block: true,
          reason: "Plan mode: bash command blocked (read-only allowlist). Command: " + command,
        };
      }
    }
  });
}
`;
