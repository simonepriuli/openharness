export interface PendingQuestionOption {
  id: string;
  label: string;
}

export interface PendingQuestionItem {
  id: string;
  prompt: string;
  allowMultiple: boolean;
  options: PendingQuestionOption[];
  selectedOptionIds: string[];
}

export interface PendingQuestionState {
  title: string;
  questions: PendingQuestionItem[];
  currentQuestionIndex: number;
  source: "prompt" | "extension-ui";
  requestId?: string;
}

interface AskQuestionOptionLike {
  id?: unknown;
  label?: unknown;
}

interface AskQuestionItemLike {
  id?: unknown;
  prompt?: unknown;
  allow_multiple?: unknown;
  allowMultiple?: unknown;
  options?: unknown;
}

interface AskQuestionPayloadLike {
  title?: unknown;
  questions?: unknown;
}

const QUESTION_TOOL_NAMES = new Set(["ask_question", "question", "questionnaire"]);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOption(raw: unknown, fallbackIndex: number): PendingQuestionOption | null {
  if (!raw || typeof raw !== "object") return null;
  const option = raw as AskQuestionOptionLike;
  const label = asNonEmptyString(option.label);
  if (!label) return null;
  return {
    id: asNonEmptyString(option.id) ?? `option-${fallbackIndex + 1}`,
    label,
  };
}

function parseQuestion(raw: unknown, fallbackIndex: number): PendingQuestionItem | null {
  if (!raw || typeof raw !== "object") return null;
  const question = raw as AskQuestionItemLike;
  const prompt = asNonEmptyString(question.prompt);
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const options = rawOptions
    .map((option, index) => parseOption(option, index))
    .filter((option): option is PendingQuestionOption => option !== null);
  if (!prompt || options.length === 0) return null;
  const id = asNonEmptyString(question.id) ?? `question-${fallbackIndex + 1}`;
  const allowMultiple =
    question.allow_multiple === true || question.allowMultiple === true;
  return {
    id,
    prompt,
    allowMultiple,
    options,
    selectedOptionIds: [],
  };
}

export function parsePendingQuestionFromTool(
  toolName: string,
  args: unknown,
): PendingQuestionState | null {
  if (!QUESTION_TOOL_NAMES.has(toolName.trim().toLowerCase())) return null;
  if (!args || typeof args !== "object") return null;

  const payload = args as AskQuestionPayloadLike;
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = rawQuestions
    .map((question, index) => parseQuestion(question, index))
    .filter((question): question is PendingQuestionItem => question !== null);
  if (questions.length === 0) return null;

  return {
    title: asNonEmptyString(payload.title) ?? "Questions",
    questions,
    currentQuestionIndex: 0,
    source: "prompt",
  };
}

interface ExtensionUiSelectRequestLike {
  type?: unknown;
  id?: unknown;
  method?: unknown;
  title?: unknown;
  options?: unknown;
}

export interface ExtensionUiSelectSnapshot {
  requestId: string;
  prompt: string;
  options: PendingQuestionOption[];
}

export function parseExtensionUiSelectSnapshot(
  event: unknown,
): ExtensionUiSelectSnapshot | null {
  if (!event || typeof event !== "object") return null;
  const request = event as ExtensionUiSelectRequestLike;
  if (request.type !== "extension_ui_request") return null;
  if (request.method !== "select") return null;
  const requestId = asNonEmptyString(request.id);
  if (!requestId) return null;

  const rawOptions = Array.isArray(request.options) ? request.options : [];
  const options = rawOptions
    .map((option, index): PendingQuestionOption | null => {
      const label = asNonEmptyString(option);
      if (!label) return null;
      return { id: `option-${index + 1}`, label };
    })
    .filter((option): option is PendingQuestionOption => option !== null);
  if (options.length === 0) return null;

  return {
    requestId,
    prompt: asNonEmptyString(request.title) ?? "Pick an option",
    options,
  };
}

function answerForQuestion(question: PendingQuestionItem): string {
  if (!question.selectedOptionIds.length) return "Skipped";
  const selected = new Set(question.selectedOptionIds);
  const labels = question.options
    .filter((option) => selected.has(option.id))
    .map((option) => option.label);
  return labels.length > 0 ? labels.join(", ") : "Skipped";
}

export function buildPendingQuestionResponse(state: PendingQuestionState): string {
  const firstQuestion = state.questions[0];
  if (!firstQuestion) return "";
  if (state.questions.length === 1) {
    return answerForQuestion(firstQuestion);
  }
  return state.questions
    .map((question, index) => `${index + 1}. ${question.prompt} — ${answerForQuestion(question)}`)
    .join("\n");
}

export function withQuestionSelection(
  state: PendingQuestionState,
  questionIndex: number,
  optionId: string,
): PendingQuestionState {
  const questions = state.questions.map((question, index) => {
    if (index !== questionIndex) return question;
    const isSelected = question.selectedOptionIds.includes(optionId);
    if (question.allowMultiple) {
      return {
        ...question,
        selectedOptionIds: isSelected
          ? question.selectedOptionIds.filter((id) => id !== optionId)
          : [...question.selectedOptionIds, optionId],
      };
    }
    return {
      ...question,
      selectedOptionIds: isSelected ? [] : [optionId],
    };
  });
  return { ...state, questions };
}

export function withQuestionIndex(
  state: PendingQuestionState,
  nextIndex: number,
): PendingQuestionState {
  const maxIndex = Math.max(0, state.questions.length - 1);
  const currentQuestionIndex = Math.min(maxIndex, Math.max(0, nextIndex));
  return { ...state, currentQuestionIndex };
}
