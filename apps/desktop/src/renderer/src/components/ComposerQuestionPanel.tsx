import type { PendingQuestionItem, PendingQuestionState } from "../lib/pending-question";

interface ComposerQuestionPanelProps {
  state: PendingQuestionState;
  disabled: boolean;
  onPickOption: (optionId: string) => void;
  onPrevious: () => void;
  onSkip: () => void;
  onNext: () => void;
}

function optionKeyBadge(index: number): string {
  const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < base.length) return base[index]!;
  return String(index + 1);
}

function isOptionSelected(question: PendingQuestionItem, optionId: string): boolean {
  return question.selectedOptionIds.includes(optionId);
}

export function ComposerQuestionPanel({
  state,
  disabled,
  onPickOption,
  onPrevious,
  onSkip,
  onNext,
}: ComposerQuestionPanelProps) {
  const totalQuestions = state.questions.length;
  const question = state.questions[state.currentQuestionIndex];
  if (!question) return null;

  const canGoPrevious = state.currentQuestionIndex > 0;
  const canGoNext = state.currentQuestionIndex < totalQuestions - 1;
  const nextLabel = canGoNext ? "Next" : "Submit";
  const hasSelection = question.selectedOptionIds.length > 0;

  return (
    <section className="composer-question-panel" aria-live="polite">
      <header className="composer-question-header">
        <span className="composer-question-title">{state.title}</span>
        <div className="composer-question-progress">
          <button
            type="button"
            className="composer-question-nav-btn"
            aria-label="Previous question"
            onClick={onPrevious}
            disabled={disabled || !canGoPrevious}
          >
            <svg viewBox="0 0 16 16" aria-hidden>
              <path
                d="M9.5 3.5 5.5 8l4 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <span>
            {state.currentQuestionIndex + 1} of {totalQuestions}
          </span>
          <button
            type="button"
            className="composer-question-nav-btn"
            aria-label="Next question"
            onClick={onNext}
            disabled={disabled || !canGoNext}
          >
            <svg viewBox="0 0 16 16" aria-hidden>
              <path
                d="M6.5 3.5 10.5 8l-4 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <p className="composer-question-prompt">{question.prompt}</p>

      <div className="composer-question-options" role="list">
        {question.options.map((option, index) => {
          const selected = isOptionSelected(question, option.id);
          return (
            <button
              key={option.id}
              type="button"
              role="listitem"
              className={`composer-question-option${selected ? " composer-question-option-selected" : ""}`}
              onClick={() => onPickOption(option.id)}
              disabled={disabled}
            >
              <span className="composer-question-option-key">{optionKeyBadge(index)}</span>
              <span className="composer-question-option-label">{option.label}</span>
            </button>
          );
        })}
      </div>

      <footer className="composer-question-footer">
        <button
          type="button"
          className="composer-question-text-btn"
          onClick={onSkip}
          disabled={disabled}
        >
          Skip
        </button>
        <button
          type="button"
          className="composer-question-primary-btn"
          onClick={onNext}
          disabled={disabled || !hasSelection}
        >
          {nextLabel}
        </button>
      </footer>
    </section>
  );
}
