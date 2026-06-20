import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
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
  ensureCreateThreadExtension(agentDir);
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
const OPENHARNESS_KNOWLEDGE_WORKFLOW_EXTENSION_VERSION = 2;
const OPENHARNESS_KNOWLEDGE_WORKFLOW_VERSION_MARKER = `openharness-knowledge-workflow-version:${OPENHARNESS_KNOWLEDGE_WORKFLOW_EXTENSION_VERSION}`;
const OPENHARNESS_EXA_WEB_SEARCH_EXTENSION_VERSION = 1;
const OPENHARNESS_EXA_WEB_SEARCH_VERSION_MARKER = `openharness-exa-web-search-version:${OPENHARNESS_EXA_WEB_SEARCH_EXTENSION_VERSION}`;
const OPENHARNESS_CREATE_THREAD_EXTENSION_VERSION = 1;
const OPENHARNESS_CREATE_THREAD_VERSION_MARKER = `openharness-create-thread-version:${OPENHARNESS_CREATE_THREAD_EXTENSION_VERSION}`;

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

function ensureCreateThreadExtension(agentDir: string): void {
  const extensionsDir = path.join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const extensionPath = path.join(extensionsDir, "openharness-create-thread.ts");
  if (existsSync(extensionPath)) {
    const existing = readFileSync(extensionPath, "utf8");
    if (existing.includes(OPENHARNESS_CREATE_THREAD_VERSION_MARKER)) return;
  }
  writeFileSync(
    extensionPath,
    `// ${OPENHARNESS_CREATE_THREAD_VERSION_MARKER}\n${OPENHARNESS_CREATE_THREAD_EXTENSION}`,
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

const OPENHARNESS_CREATE_THREAD_EXTENSION = `import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const CREATE_THREAD_UI_TITLE = "__openharness:create_thread__";

const CreateThreadParams = Type.Object({
  title: Type.Optional(Type.String({ description: "Short title for the new thread sidebar entry" })),
  initial_prompt: Type.Optional(
    Type.String({ description: "First message to send in the new thread (runs in background)" }),
  ),
  switch_to: Type.Optional(
    Type.Boolean({ description: "Switch the user's active view to the new thread (default false)" }),
  ),
});

type CreateThreadBridgeResponse = {
  conversationId?: string;
  sessionKey?: string;
  title?: string;
  promptSent?: boolean;
  error?: string;
};

function formatCreateThreadResult(data: CreateThreadBridgeResponse): string {
  if (data.error) return "Error: " + data.error;
  const lines = [
    "Created thread:",
    "- conversationId: " + (data.conversationId ?? ""),
    "- sessionKey: " + (data.sessionKey ?? ""),
    "- title: " + (data.title ?? ""),
    "- promptSent: " + String(data.promptSent === true),
  ];
  return lines.join("\\n");
}

export default function openharnessCreateThread(pi: ExtensionAPI) {
  pi.registerTool({
    name: "create_thread",
    label: "Create Thread",
    description:
      "Spin up a new OpenHarness conversation thread in the current project. Optionally send an initial prompt that runs in the background while the current thread continues.",
    promptSnippet:
      "create_thread(title?, initial_prompt?, switch_to?) — start a new project thread with optional background work.",
    promptGuidelines: [
      "Use create_thread to parallelize independent work that needs a separate conversation context in the same project.",
      "Prefer swarm_dispatch for short subtasks within the current thread; use create_thread when a distinct thread history is needed.",
      "Always provide a focused initial_prompt describing what the new thread should accomplish.",
      "Leave switch_to unset or false unless the user explicitly asked to jump to the new thread.",
      "Wait for the create_thread tool result before assuming the new thread exists; use conversationId from the result to reference it.",
    ],
    parameters: CreateThreadParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{ type: "text", text: "Error: create_thread requires OpenHarness." }],
          details: { error: "missing_ui" },
        };
      }

      const payload = JSON.stringify({
        title: params.title,
        initial_prompt: params.initial_prompt,
        switch_to: params.switch_to ?? false,
      });
      const raw = await ctx.ui.input(CREATE_THREAD_UI_TITLE, payload);
      if (!raw) {
        return {
          content: [{ type: "text", text: "Error: create_thread was cancelled." }],
          details: { error: "cancelled" },
        };
      }

      let parsed: CreateThreadBridgeResponse;
      try {
        parsed = JSON.parse(raw) as CreateThreadBridgeResponse;
      } catch {
        return {
          content: [{ type: "text", text: "Error: Invalid create_thread response from OpenHarness." }],
          details: { error: "invalid_response", raw },
        };
      }

      return {
        content: [{ type: "text", text: formatCreateThreadResult(parsed) }],
        details: parsed,
      };
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
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + WORKFLOW_PROMPT_APPEND,
  }));
}
`;
